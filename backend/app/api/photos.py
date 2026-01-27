import os
import shutil
import uuid
import json
import asyncio
from datetime import datetime
from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse, StreamingResponse
from typing import List, Optional
import io
from app.services.db import db
from app.services.drive_service import drive_service
from app.services.face_service import face_service
from app.services.thumbnail_service import thumbnail_service

router = APIRouter(prefix="/photos", tags=["photos"])

UPLOAD_ROOT = "uploads/originals"
THUMBNAIL_ROOT = "thumbnails"
os.makedirs(UPLOAD_ROOT, exist_ok=True)
os.makedirs(THUMBNAIL_ROOT, exist_ok=True)

def format_photo(row):
    if not row: return None
    d = dict(row)
    d["_id"] = d.pop("id")
    if d.get("created_at"):
        d["created_at"] = datetime.fromisoformat(d["created_at"])
    return d

async def process_photo(photo_id: str, event_id: str, event_slug: str, original_path: str, filename: str, drive_file_id: str = None):
    try:
        # 1. Upload to Drive ONLY if we don't already have a drive_file_id
        if not drive_file_id:
            drive_file_id = await drive_service.upload_photo(original_path, event_slug, filename=filename)
        
        # 2. Generate Thumbnail
        thumb_path = os.path.join(THUMBNAIL_ROOT, f"{photo_id}.jpg")
        await asyncio.to_thread(thumbnail_service.generate_thumbnail, original_path, thumb_path)
        
        # 3. Extract faces
        faces_data = await asyncio.to_thread(face_service.get_embeddings, original_path)
        
        # 4. Get image size
        def get_image_size(path):
            from PIL import Image
            with Image.open(path) as img:
                return img.size
        width, height = await asyncio.to_thread(get_image_size, original_path)

        await db.execute("""
            UPDATE photos SET 
                drive_file_id = ?, 
                thumbnail_path = ?, 
                width = ?, 
                height = ?, 
                faces_count = ?, 
                status = ?
            WHERE id = ?
        """, (drive_file_id, thumb_path, width, height, len(faces_data), "processed", photo_id))

        # 5. Store Faces
        for f in faces_data:
            face_id = str(uuid.uuid4())
            embedding_json = json.dumps(f["embedding"].tolist() if hasattr(f["embedding"], "tolist") else f["embedding"])
            bbox_json = json.dumps({
                "x": f["bbox"][0],
                "y": f["bbox"][1],
                "w": f["bbox"][2] - f["bbox"][0],
                "h": f["bbox"][3] - f["bbox"][1]
            })
            
            await db.execute("""
                INSERT INTO faces (id, photo_id, event_id, embedding_vector, bounding_box, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (face_id, photo_id, event_id, embedding_json, bbox_json, datetime.utcnow().isoformat()))
            
    except Exception as e:
        print(f"Error processing photo {photo_id}: {e}")
        await db.execute("UPDATE photos SET status = ? WHERE id = ?", ("error", photo_id))

@router.post("/upload")
async def upload_photos(
    background_tasks: BackgroundTasks,
    event_id: str,
    files: List[UploadFile] = File(...)
):
    row = await db.fetch_one("SELECT slug FROM events WHERE id = ?", (event_id,))
    if not row:
        raise HTTPException(status_code=404, detail="Event not found")
    event_slug = row["slug"]

    processed_count = 0
    for file in files:
        photo_id = str(uuid.uuid4())
        file_ext = file.filename.split(".")[-1]
        original_path = os.path.join(UPLOAD_ROOT, f"{photo_id}.{file_ext}")
        
        with open(original_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        await db.execute("""
            INSERT INTO photos (id, event_id, original_file_name, status, created_at)
            VALUES (?, ?, ?, ?, ?)
        """, (photo_id, event_id, file.filename, "pending", datetime.utcnow().isoformat()))
        
        background_tasks.add_task(process_photo, photo_id, event_id, event_slug, original_path, file.filename)
        processed_count += 1

    return {"message": f"Successfully started processing {processed_count} photos", "event_id": event_id}

async def run_sync_task(event_id: str):
    try:
        row = await db.fetch_one("SELECT * FROM events WHERE id = ?", (event_id,))
        if not row or not row.get("drive_folder_url"):
            print(f"Sync failed: Event {event_id} not found or no drive_folder_url")
            return
        event = dict(row)

        await db.execute("UPDATE events SET sync_status = ? WHERE id = ?", ("syncing", event_id))
        
        folder_id = drive_service.get_folder_id_from_url(event["drive_folder_url"])
        print(f"Starting sync for folder: {folder_id}")
        
        files_to_sync = await drive_service.list_files_recursive(folder_id)
        print(f"Found {len(files_to_sync)} files in Drive total")
        
        new_files = []
        for f in files_to_sync:
            existing = await db.fetch_one("SELECT id FROM photos WHERE drive_file_id = ?", (f["id"],))
            if not existing:
                new_files.append(f)
            else:
                print(f"Skipping already synced file: {f['name']}")

        print(f"Identified {len(new_files)} new photos to index")

        # Pre-register all new photos
        inserted_items = []
        for f in new_files:
            photo_id = str(uuid.uuid4())
            file_ext = f['name'].split(".")[-1] if "." in f['name'] else "jpg"
            original_path = os.path.join(UPLOAD_ROOT, f"{photo_id}.{file_ext}")
            
            await db.execute("""
                INSERT INTO photos (id, event_id, original_file_name, drive_file_id, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (photo_id, event_id, f['name'], f["id"], "pending", datetime.utcnow().isoformat()))
            inserted_items.append((photo_id, original_path, f))

        # download and process
        for photo_id, original_path, f in inserted_items:
            try:
                print(f"Downloading & Processing: {f['name']}")
                content, filename = await drive_service.download_file(f["id"])
                if not content:
                    await db.execute("UPDATE photos SET status = ? WHERE id = ?", ("error", photo_id))
                    continue
                
                with open(original_path, "wb") as buffer:
                    buffer.write(content)
                    
                await process_photo(photo_id, event_id, event["slug"], original_path, filename, drive_file_id=f["id"])
            except Exception as loop_err:
                print(f"Error processing synced photo {f['name']}: {loop_err}")
                await db.execute("UPDATE photos SET status = ? WHERE id = ?", ("error", photo_id))
            
        await db.execute("""
            UPDATE events SET sync_status = ?, last_sync_at = ? WHERE id = ?
        """, ("completed", datetime.utcnow().isoformat(), event_id))
        print(f"Sync completed successfully for event: {event_id}")
    except Exception as e:
        print(f"Sync task fatal error: {e}")
        await db.execute("UPDATE events SET sync_status = ? WHERE id = ?", ("error", event_id))

@router.post("/sync/{event_id}")
async def start_sync(event_id: str, background_tasks: BackgroundTasks):
    row = await db.fetch_one("SELECT drive_folder_url FROM events WHERE id = ?", (event_id,))
    if not row:
        raise HTTPException(status_code=404, detail="Event not found")
        
    if not row["drive_folder_url"]:
        raise HTTPException(status_code=400, detail="Drive folder URL not configured")
        
    background_tasks.add_task(run_sync_task, event_id)
    return {"message": "Sync started in background"}

@router.get("/status/{event_id}")
async def get_event_status(event_id: str):
    row = await db.fetch_one("SELECT * FROM events WHERE id = ?", (event_id,))
    if not row:
        raise HTTPException(status_code=404, detail="Event not found")
    event = dict(row)
        
    res = await db.fetch_one("SELECT COUNT(*) as total FROM photos WHERE event_id = ?", (event_id,))
    total = res["total"]
    
    res = await db.fetch_one("SELECT COUNT(*) as pending FROM photos WHERE event_id = ? AND status = 'pending'", (event_id,))
    pending = res["pending"]
    
    res = await db.fetch_one("SELECT COUNT(*) as processed FROM photos WHERE event_id = ? AND status = 'processed'", (event_id,))
    processed = res["processed"]
    
    res = await db.fetch_one("SELECT COUNT(*) as errors FROM photos WHERE event_id = ? AND status = 'error'", (event_id,))
    errors = res["errors"]
    
    res = await db.fetch_one("SELECT SUM(faces_count) as total_faces FROM photos WHERE event_id = ?", (event_id,))
    total_faces = res["total_faces"] or 0

    return {
        "event_id": event_id,
        "sync_status": event.get("sync_status", "idle"),
        "last_sync_at": event.get("last_sync_at"),
        "total": total,
        "pending": pending,
        "processed": processed,
        "errors": errors,
        "total_faces": total_faces,
        "progress": (processed / total * 100) if total > 0 else 0
    }

@router.get("/original/{photo_id}")
async def get_original(photo_id: str):
    row = await db.fetch_one("SELECT * FROM photos WHERE id = ?", (photo_id,))
    if not row:
        raise HTTPException(status_code=404, detail="Photo not found")
    photo = dict(row)
    
    local_path = None
    for ext in ['jpg', 'jpeg', 'png', 'JPG', 'JPEG', 'PNG', 'webp']:
        path = os.path.join(UPLOAD_ROOT, f"{photo_id}.{ext}")
        if os.path.exists(path):
            local_path = path
            break
            
    if local_path:
        return FileResponse(local_path)
    
    if photo.get("drive_file_id"):
        try:
            content, filename = await drive_service.download_file(photo["drive_file_id"])
            if content:
                return StreamingResponse(io.BytesIO(content), media_type="image/jpeg")
        except Exception as e:
            print(f"Drive fetch error: {e}")
            
    raise HTTPException(status_code=404, detail="Original file not found")

@router.get("/thumbnail/{photo_id}")
async def get_thumbnail(photo_id: str):
    row = await db.fetch_one("SELECT thumbnail_path FROM photos WHERE id = ?", (photo_id,))
    if not row or not row["thumbnail_path"]:
        raise HTTPException(status_code=404, detail="Thumbnail not found")
    
    if not os.path.exists(row["thumbnail_path"]):
        raise HTTPException(status_code=404, detail="Thumbnail file not found on disk")
        
    return FileResponse(row["thumbnail_path"])

@router.get("/download/{photo_id}")
async def download_photo(photo_id: str):
    row = await db.fetch_one("SELECT drive_file_id FROM photos WHERE id = ?", (photo_id,))
    if not row or not row["drive_file_id"]:
        raise HTTPException(status_code=404, detail="Photo not found")
    
    try:
        content, filename = await drive_service.download_file(row["drive_file_id"])
        if content is None:
            raise HTTPException(status_code=500, detail="Failed to download from Drive")
            
        return StreamingResponse(
            io.BytesIO(content),
            media_type="application/octet-stream",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
