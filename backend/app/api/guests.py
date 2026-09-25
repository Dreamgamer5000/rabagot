from typing import Optional, List
import asyncio
import os
import shutil
import uuid
import json
import numpy as np
from datetime import datetime
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks, Response
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel
import io
import zipfile
from PIL import Image
from app.services.db import db
from app.services.drive_service import drive_service
from app.services.face_service import face_service
from app.core.config import get_settings

router = APIRouter(prefix="/guests", tags=["guests"])
settings = get_settings()

os.makedirs(settings.GUEST_SELFIES_DIR, exist_ok=True)

# Concurrency locks to protect CPU and RAM
selfie_processing_lock = asyncio.Lock()
guest_zip_lock = asyncio.Lock()


async def _process_guest_request_internal(request_id: str, event_slug: str, name: str,
                                          email: str, selfie_path: str):
    try:
        # 1. Extract face embedding from guest selfie
        faces = await asyncio.to_thread(face_service.get_embeddings, selfie_path)
        if not faces:
            await db.execute(
                "UPDATE guests SET status = ?, error = ? WHERE id = ?",
                ("error", "No face detected in selfie. Please ensure your face is clearly visible.", request_id))
            return

        # Prioritize largest face (greatest bounding box area) in case multiple people/background faces are detected
        faces.sort(key=lambda f: (f["bbox"][2] - f["bbox"][0]) * (f["bbox"][3] - f["bbox"][1]), reverse=True)
        guest_embedding = np.array(faces[0]["embedding"])

        # 2. Get event ID
        row = await db.fetch_one("SELECT id FROM events WHERE slug = ?", (event_slug, ))
        if not row:
            await db.execute(
                "UPDATE guests SET status = ?, error = ? WHERE id = ?",
                ("error", "Event not found", request_id))
            return
        event_id = row["id"]

        # 3. Match against stored faces using fast vectorized dot products
        rows = await db.fetch_all(
            "SELECT photo_id, embedding_vector FROM faces WHERE event_id = ?",
            (event_id, ))

        if not rows:
            # Event has no indexed faces yet
            await db.execute(
                "UPDATE guests SET status = ?, match_count = ?, matched_photo_ids = ? WHERE id = ?",
                ("completed", 0, "[]", request_id))
            return

        stored_embeddings = []
        photo_ids = []
        for face_row in rows:
            try:
                emb = json.loads(face_row["embedding_vector"])
                stored_embeddings.append(emb)
                photo_ids.append(face_row["photo_id"])
            except Exception:
                continue

        matches = []
        if stored_embeddings:
            matrix = np.array(stored_embeddings)  # shape: (N, 512)
            matrix_norm = np.linalg.norm(matrix, axis=1)
            g_norm = np.linalg.norm(guest_embedding)

            if g_norm > 0:
                # Fast matrix cosine similarity across all event faces
                scores = (matrix @ guest_embedding) / (matrix_norm * g_norm + 1e-10)
                for idx, score in enumerate(scores):
                    if float(score) >= settings.FACE_SIMILARITY_THRESHOLD:
                        matches.append({
                            "photo_id": photo_ids[idx],
                            "score": float(score)
                        })

        # 4. Deduplicate matches by photo_id (keeping highest score per photo)
        unique_matches = {}
        for m in matches:
            p_id = m["photo_id"]
            if p_id not in unique_matches or m["score"] > unique_matches[p_id]["score"]:
                unique_matches[p_id] = m

        sorted_matches = sorted(unique_matches.values(),
                                key=lambda x: x["score"], 
                                reverse=True)
        matched_photo_ids = [m["photo_id"] for m in sorted_matches]

        # 5. Final Update
        await db.execute(
            """
            UPDATE guests SET 
                status = ?, match_count = ?, matched_photo_ids = ?, error = NULL 
            WHERE id = ?
        """, ("completed", len(matched_photo_ids),
              json.dumps(matched_photo_ids), request_id))

    except Exception as e:
        print(f"Error processing guest request {request_id}: {e}")
        await db.execute(
            "UPDATE guests SET status = ?, error = ? WHERE id = ?",
            ("error", str(e), request_id))


async def process_guest_request(request_id: str, event_slug: str, name: str,
                                email: str, selfie_path: str):
    async with selfie_processing_lock:
        await _process_guest_request_internal(request_id, event_slug, name, email, selfie_path)


@router.post("/request")
@router.post("/upload")
async def guest_request(background_tasks: BackgroundTasks,
                        event_slug: str = Form(...),
                        name: str = Form(...),
                        email: Optional[str] = Form(None),
                        phone: Optional[str] = Form(None),
                        secret_code: Optional[str] = Form(None),
                        selfie: UploadFile = File(...)):
    try:
        clean_name = (name or "").strip()
        if not clean_name:
            raise HTTPException(status_code=400, detail="Guest name is required")

        clean_email = (email or "").strip()
        if not clean_email:
            clean_email = f"guest_{uuid.uuid4().hex[:8]}@guest.com"

        row = await db.fetch_one(
            "SELECT id, secret_code FROM events WHERE slug = ?", (event_slug.strip(), ))
        if not row:
            raise HTTPException(status_code=404, detail="Event not found")

        event_id = row["id"]
        expected_code = row.get("secret_code")

        if expected_code and expected_code.strip():
            if (secret_code or "").strip() != expected_code.strip():
                raise HTTPException(status_code=401, detail="Invalid secret code")

        # Ensure uploads directory exists
        os.makedirs(settings.GUEST_SELFIES_DIR, exist_ok=True)

        request_id = str(uuid.uuid4())
        raw_ext = (selfie.filename.rsplit(".", 1)[-1] if (selfie.filename and "." in selfie.filename) else "jpg").lower()
        file_ext = "".join(c for c in raw_ext if c.isalnum()) or "jpg"
        selfie_path = os.path.join(settings.GUEST_SELFIES_DIR, f"{request_id}.{file_ext}")

        content = await selfie.read()
        if not content:
            raise HTTPException(status_code=400, detail="Uploaded selfie file is empty")

        with open(selfie_path, "wb") as buffer:
            buffer.write(content)

        existing_request = await db.fetch_one(
            """
            SELECT * FROM guests WHERE event_id = ? AND name = ? AND email = ?
        """, (event_id, clean_name, clean_email))

        if existing_request:
            # Update existing guest with new selfie and trigger re-match
            req_id = existing_request["id"]
            await db.execute(
                """
                UPDATE guests SET selfie_path = ?, status = 'processing', error = NULL WHERE id = ?
            """, (selfie_path, req_id))
            background_tasks.add_task(process_guest_request, req_id, event_slug, clean_name, clean_email, selfie_path)
            return {
                "message": "Updating your photo matches...",
                "request_id": req_id
            }

        await db.execute(
            """
            INSERT INTO guests (id, event_id, name, email, phone, selfie_path, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (request_id, event_id, clean_name, clean_email, phone, selfie_path, "processing",
              datetime.utcnow().isoformat()))

        background_tasks.add_task(process_guest_request, request_id, event_slug,
                                  clean_name, clean_email, selfie_path)
        return {
            "message": "Your photos are being processed.",
            "request_id": request_id
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in guest_request: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to process selfie submission: {str(e)}")


@router.get("/status/{request_id}")
async def get_guest_request_status(request_id: str):
    row = await db.fetch_one("SELECT * FROM guests WHERE id = ?",
                             (request_id, ))
    if not row:
        raise HTTPException(status_code=404, detail="Request not found")

    return {
        "status": row.get("status"),
        "match_count": row.get("match_count", 0),
        "error": row.get("error")
    }


@router.get("/event/{event_id}")
async def get_event_guests(event_id: str):
    """Get all guests who have joined a specific event"""
    rows = await db.fetch_all(
        """
        SELECT id, name, email, phone, selfie_path, status, match_count, created_at 
        FROM guests 
        WHERE event_id = ? 
        ORDER BY created_at DESC
        """, (event_id, ))

    event = await db.fetch_one("SELECT * FROM events WHERE id = ?", (event_id,))
    guests = []
    for row in rows:
        guests.append({
            "id": row["id"],
            "name": row["name"],
            "email": row["email"],
            "phone": row.get("phone"),
            "selfie_path": row.get("selfie_path"),
            "status": row["status"],
            "match_count": row.get("match_count", 0),
            "created_at": row["created_at"],
            "gallery_link": f"/event/{event['slug']}/guest/{row['id']}"
        })

    return {"guests": guests, "total": len(guests)}


@router.get("/selfie/{guest_id}")
async def get_guest_selfie(guest_id: str):
    """Serve the guest's selfie image for avatar display"""
    row = await db.fetch_one("SELECT selfie_path FROM guests WHERE id = ?",
                             (guest_id,))
    if not row or not row.get("selfie_path"):
        raise HTTPException(status_code=404, detail="Selfie not found")

    selfie_path = row["selfie_path"]
    if not os.path.exists(selfie_path):
        raise HTTPException(status_code=404, detail="Selfie file not found")

    return FileResponse(selfie_path)


@router.delete("/{guest_id}")
async def delete_guest(guest_id: str):
    """Delete a guest to allow them to rescan their face"""
    row = await db.fetch_one("SELECT selfie_path FROM guests WHERE id = ?",
                             (guest_id,))
    if not row:
        raise HTTPException(status_code=404, detail="Guest not found")

    # Delete the selfie file if it exists
    selfie_path = row.get("selfie_path")
    if selfie_path and os.path.exists(selfie_path):
        try:
            os.remove(selfie_path)
        except Exception as e:
            print(f"Error deleting selfie file: {e}")

    # Delete the guest from database
    await db.execute("DELETE FROM guests WHERE id = ?", (guest_id,))

    return {"message": "Guest deleted successfully"}


@router.get("/{request_id}/matches")
async def get_guest_matches(request_id: str, page: int = 1, limit: int = 50):
    row = await db.fetch_one("SELECT * FROM guests WHERE id = ?",
                             (request_id, ))
    if not row:
        raise HTTPException(status_code=404, detail="Request not found")

    photo_ids = json.loads(row.get("matched_photo_ids") or "[]")
    total_matches = len(photo_ids)

    start = (page - 1) * limit
    end = start + limit
    paged_ids = photo_ids[start:end]

    if not paged_ids:
        return {
            "guest_name":
            row.get("name"),
            "match_count":
            total_matches,
            "page":
            page,
            "limit":
            limit,
            "photos": [],
            "total_pages":
            (total_matches + limit - 1) // limit if total_matches > 0 else 0
        }

    # Fetch details
    placeholders = ",".join(["?"] * len(paged_ids))
    photo_rows = await db.fetch_all(
        f"SELECT * FROM photos WHERE id IN ({placeholders})", paged_ids)

    fetched_photos = {}
    for p in photo_rows:
        fetched_photos[p["id"]] = {
            "id": p["id"],
            "filename": p.get("original_file_name"),
            "thumbnail_url": f"/photos/thumbnail/{p['id']}",
            "preview_url": f"/photos/preview/{p['id']}",
            "original_url": f"/photos/original/{p['id']}",
            "drive_file_id": p.get("drive_file_id")
        }

    photos = []
    for p_id in paged_ids:
        if p_id in fetched_photos:
            photos.append(fetched_photos[p_id])

    return {
        "guest_name": row.get("name"),
        "match_count": total_matches,
        "page": page,
        "limit": limit,
        "photos": photos,
        "total_pages": (total_matches + limit - 1) // limit
    }


async def _generate_guest_zip(request_id: str):
    row = await db.fetch_one("SELECT * FROM guests WHERE id = ?", (request_id,))
    if not row:
        raise HTTPException(status_code=404, detail="Request not found")

    photo_ids = json.loads(row.get("matched_photo_ids") or "[]")
    if not photo_ids:
        raise HTTPException(status_code=400, detail="No photos to download")

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        placeholders = ",".join(["?"] * len(photo_ids))
        photo_rows = await db.fetch_all(
            f"SELECT * FROM photos WHERE id IN ({placeholders})", photo_ids)

        for p in photo_rows:
            p_id = p["id"]
            raw_name = p.get("original_file_name") or f"{p_id}.jpg"
            base_name, _ = os.path.splitext(raw_name)
            jpeg_filename = f"{base_name}.jpg"

            # 1. Check local original
            local_path = None
            for ext in ['jpg', 'jpeg', 'png', 'JPG', 'JPEG', 'PNG']:
                path = os.path.join(settings.UPLOAD_ROOT, f"{p_id}.{ext}")
                if os.path.exists(path):
                    local_path = path
                    break

            if local_path:
                zip_file.write(local_path, raw_name)
                continue

            # 2. Check 2K local preview -> convert to universal JPEG
            preview_path = os.path.join(settings.PREVIEWS_ROOT, f"{p_id}.webp")
            if os.path.exists(preview_path):
                try:
                    with Image.open(preview_path) as img:
                        if img.mode != "RGB":
                            img = img.convert("RGB")
                        buf = io.BytesIO()
                        img.save(buf, format="JPEG", quality=88)
                        zip_file.writestr(jpeg_filename, buf.getvalue())
                    continue
                except Exception as e:
                    print(f"Zip preview convert error for {p_id}: {e}")

            # 3. Fallback to Google Drive if needed
            if p.get("drive_file_id"):
                try:
                    content, filename = await drive_service.download_file(
                        p["drive_file_id"])
                    if content:
                        zip_file.writestr(filename, content)
                except Exception as e:
                    print(f"Zip inclusion error for {p_id}: {e}")

    zip_data = zip_buffer.getvalue()
    safe_name = "".join(c for c in (row.get('name') or 'guest') if c.isalnum() or c in (' ', '_', '-')).strip()
    return Response(
        content=zip_data,
        media_type="application/x-zip-compressed",
        headers={
            "Content-Disposition": f"attachment; filename={safe_name}_photos.zip",
            "Content-Length": str(len(zip_data))
        })


@router.get("/{request_id}/download-zip")
async def download_guest_zip(request_id: str):
    async with guest_zip_lock:
        return await _generate_guest_zip(request_id)

