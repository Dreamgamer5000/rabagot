import os
import shutil
import uuid
import json
import asyncio
import io
import zipfile
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel
from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks, Response
from fastapi.responses import FileResponse, StreamingResponse
from PIL import Image
from app.core.config import get_settings
from app.services.db import db
from app.services.drive_service import drive_service
from app.services.face_service import face_service
from app.services.thumbnail_service import thumbnail_service
from app.services.storage import get_storage_provider

router = APIRouter(prefix="/photos", tags=["photos"])
settings = get_settings()

os.makedirs(settings.UPLOAD_ROOT, exist_ok=True)
os.makedirs(settings.THUMBNAIL_ROOT, exist_ok=True)
os.makedirs(settings.PREVIEWS_ROOT, exist_ok=True)

# In-memory lock to prevent concurrent duplicate sync tasks for the same event
active_sync_events = set()
# Concurrency lock to serialize in-memory ZIP generations and protect RAM
bulk_zip_lock = asyncio.Lock()


def format_photo(row):
    if not row: return None
    d = dict(row)
    d["_id"] = d.pop("id")
    if d.get("created_at"):
        d["created_at"] = datetime.fromisoformat(d["created_at"])
    return d


async def process_photo(photo_id: str,
                        event_id: str,
                        event_slug: str,
                        original_path: str,
                        filename: str,
                        drive_file_id: str = None,
                        storage_type: str = "drive",
                        storage_path: str = None):
    try:
        # 1. Upload to Drive ONLY if storage_type is drive and we don't already have a drive_file_id
        if storage_type == "drive" and not drive_file_id:
            drive_file_id = await drive_service.upload_photo(original_path,
                                                             event_slug,
                                                             filename=filename)

        # 2. Generate Thumbnail (512px) and 2K WebP Screen Preview (2048px)
        thumb_path = os.path.join(settings.THUMBNAIL_ROOT, f"{photo_id}.jpg")
        preview_path = os.path.join(settings.PREVIEWS_ROOT, f"{photo_id}.webp")
        await asyncio.to_thread(thumbnail_service.generate_thumbnail,
                                original_path, thumb_path)
        await asyncio.to_thread(thumbnail_service.generate_preview,
                                original_path, preview_path, 2048, 82)

        # 3. Extract faces (gracefully handle images without faces)
        try:
            faces_data = await asyncio.to_thread(face_service.get_embeddings,
                                                 original_path)
        except Exception as face_err:
            print(f"Face extraction warning for {photo_id}: {face_err}")
            faces_data = []

        # 4. Get image size
        def get_image_size(path):
            try:
                with Image.open(path) as img:
                    return img.size
            except Exception:
                return (0, 0)

        width, height = await asyncio.to_thread(get_image_size, original_path)

        await db.execute(
            """
            UPDATE photos SET 
                drive_file_id = ?, 
                storage_type = ?,
                storage_path = ?,
                thumbnail_path = ?, 
                width = ?, 
                height = ?, 
                faces_count = ?, 
                status = ?
            WHERE id = ?
        """, (drive_file_id, storage_type, storage_path, thumb_path, width, height, len(faces_data),
              "processed", photo_id))

        # 5. Store Faces (clean up any previous faces for this photo first)
        await db.execute("DELETE FROM faces WHERE photo_id = ?", (photo_id,))
        for f in faces_data:
            face_id = str(uuid.uuid4())
            embedding_json = json.dumps(f["embedding"].tolist(
            ) if hasattr(f["embedding"], "tolist") else f["embedding"])
            bbox_json = json.dumps({
                "x": f["bbox"][0],
                "y": f["bbox"][1],
                "w": f["bbox"][2] - f["bbox"][0],
                "h": f["bbox"][3] - f["bbox"][1]
            })

            await db.execute(
                """
                INSERT INTO faces (id, photo_id, event_id, embedding_vector, bounding_box, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (face_id, photo_id, event_id, embedding_json, bbox_json,
                  datetime.utcnow().isoformat()))

        # 6. Ephemeral cleanup: ONLY if photo is stored on Google Drive, delete temporary local original.
        # For LOCAL STORAGE, NEVER DELETE THE ORIGINAL FILE.
        if storage_type == "drive" and drive_file_id and os.path.exists(original_path):
            try:
                os.remove(original_path)
            except Exception as rem_err:
                print(f"Non-fatal error removing temporary original {original_path}: {rem_err}")

    except Exception as e:
        print(f"Error processing photo {photo_id}: {e}")
        await db.execute("UPDATE photos SET status = ? WHERE id = ?",
                         ("error", photo_id))
        # Ensure temporary file is cleaned up on error ONLY for drive storage
        if storage_type == "drive" and drive_file_id and os.path.exists(original_path):
            try:
                os.remove(original_path)
            except Exception:
                pass


@router.post("/upload")
async def upload_photos(background_tasks: BackgroundTasks,
                        event_id: str,
                        files: List[UploadFile] = File(...)):
    row = await db.fetch_one("SELECT slug FROM events WHERE id = ?",
                             (event_id, ))
    if not row:
        raise HTTPException(status_code=404, detail="Event not found")
    event_slug = row["slug"]

    processed_count = 0
    for file in files:
        photo_id = str(uuid.uuid4())
        file_ext = file.filename.split(".")[-1]
        original_path = os.path.join(settings.UPLOAD_ROOT,
                                     f"{photo_id}.{file_ext}")

        with open(original_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        await db.execute(
            """
            INSERT INTO photos (id, event_id, original_file_name, status, created_at)
            VALUES (?, ?, ?, ?, ?)
        """, (photo_id, event_id, file.filename, "pending",
              datetime.utcnow().isoformat()))

        background_tasks.add_task(process_photo, photo_id, event_id,
                                  event_slug, original_path, file.filename)
        processed_count += 1

    return {
        "message": f"Successfully started processing {processed_count} photos",
        "event_id": event_id
    }


async def run_sync_task(event_id: str):
    if event_id in active_sync_events:
        print(f"Sync task already running for event: {event_id}, ignoring duplicate request.")
        return
    active_sync_events.add(event_id)
    try:
        row = await db.fetch_one("SELECT * FROM events WHERE id = ?",
                                 (event_id, ))
        if not row:
            print(f"Sync failed: Event {event_id} not found")
            return
        event = dict(row)
        storage_type = (event.get("storage_type") or "drive").lower().strip()
        location = event.get("storage_path") if storage_type == "local" else event.get("drive_folder_url")
        if not location:
            print(f"Sync failed: Event {event_id} has no location for storage type '{storage_type}'")
            return

        await db.execute("UPDATE events SET sync_status = ? WHERE id = ?",
                         ("syncing", event_id))

        provider = get_storage_provider(storage_type)
        print(f"Starting sync for event '{event.get('name')}' using {storage_type} provider at: {location}")

        files_to_sync = await provider.list_photos(location)
        print(f"Found {len(files_to_sync)} files total")

        active_file_ids = {f["id"] for f in files_to_sync}

        # 1. Prune photos that were deleted from the source
        existing_event_photos = await db.fetch_all(
            "SELECT id, drive_file_id, storage_type, storage_path, thumbnail_path, original_file_name FROM photos WHERE event_id = ?",
            (event_id, )
        )
        pruned_count = 0
        for ep in existing_event_photos:
            p_id = ep["id"]
            p_storage_type = (ep.get("storage_type") or "drive").lower().strip()
            check_id = ep.get("storage_path") if p_storage_type == "local" else ep.get("drive_file_id")

            if check_id and check_id not in active_file_ids:
                print(f"Pruning photo deleted from source: {ep.get('original_file_name')} ({p_id})")
                await db.execute("DELETE FROM faces WHERE photo_id = ?", (p_id,))
                thumb = ep.get("thumbnail_path")
                if thumb and os.path.exists(thumb):
                    try:
                        os.remove(thumb)
                    except Exception:
                        pass
                preview = os.path.join(settings.PREVIEWS_ROOT, f"{p_id}.webp")
                if os.path.exists(preview):
                    try:
                        os.remove(preview)
                    except Exception:
                        pass
                if p_storage_type == "drive":
                    for ext in ['jpg', 'jpeg', 'png', 'JPG', 'JPEG', 'PNG', 'webp', 'WEBP']:
                        old_orig = os.path.join(settings.UPLOAD_ROOT, f"{p_id}.{ext}")
                        if os.path.exists(old_orig):
                            try:
                                os.remove(old_orig)
                            except Exception:
                                pass
                await db.execute("DELETE FROM photos WHERE id = ?", (p_id,))
                pruned_count += 1
        if pruned_count > 0:
            print(f"Successfully pruned {pruned_count} deleted photos from event")

        # 2. Identify new and pending photos to index
        new_files = []
        pending_photos = []
        for f in files_to_sync:
            if storage_type == "local":
                existing = await db.fetch_one(
                    "SELECT id, status, thumbnail_path, storage_path FROM photos WHERE event_id = ? AND storage_path = ?",
                    (event_id, f["id"])
                )
            else:
                existing = await db.fetch_one(
                    "SELECT id, status, thumbnail_path, drive_file_id FROM photos WHERE drive_file_id = ?",
                    (f["id"], )
                )

            if not existing:
                new_files.append(f)
            elif existing["status"] in ("pending", "error"):
                photo_id = existing["id"]
                orig_path = f.get("path") if storage_type == "local" else os.path.join(
                    settings.UPLOAD_ROOT, f"{photo_id}.{f['name'].split('.')[-1] if '.' in f['name'] else 'jpg'}"
                )
                pending_photos.append((photo_id, orig_path, f))
            else:
                photo_id = existing["id"]
                thumb_missing = not existing.get("thumbnail_path") or not os.path.exists(existing.get("thumbnail_path") or "")
                preview_missing = not os.path.exists(os.path.join(settings.PREVIEWS_ROOT, f"{photo_id}.webp"))
                if existing["status"] == "processed" and (thumb_missing or preview_missing):
                    orig_path = f.get("path") if storage_type == "local" else os.path.join(
                        settings.UPLOAD_ROOT, f"{photo_id}.{f['name'].split('.')[-1] if '.' in f['name'] else 'jpg'}"
                    )
                    pending_photos.append((photo_id, orig_path, f))

        print(f"Identified {len(pending_photos)} pending/errored photos to re-index")
        print(f"Identified {len(new_files)} new photos to index")

        # Pre-register all new photos
        inserted_items = []
        for f in new_files:
            photo_id = str(uuid.uuid4())
            file_ext = f['name'].split(".")[-1] if "." in f['name'] else "jpg"
            if storage_type == "local":
                orig_path = f.get("path") or provider.get_local_path(f["id"], location)
                drive_fid = None
                store_path = f["id"]
            else:
                orig_path = os.path.join(settings.UPLOAD_ROOT, f"{photo_id}.{file_ext}")
                drive_fid = f["id"]
                store_path = None

            await db.execute(
                """
                INSERT INTO photos (id, event_id, original_file_name, drive_file_id, storage_type, storage_path, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (photo_id, event_id, f['name'], drive_fid, storage_type, store_path, "pending",
                  datetime.utcnow().isoformat()))
            inserted_items.append((photo_id, orig_path, f))

        # Concurrency-controlled indexing
        concurrency = max(1, int(os.getenv("SYNC_CONCURRENCY", getattr(settings, "SYNC_CONCURRENCY", 4))))
        semaphore = asyncio.Semaphore(concurrency)
        all_to_process = pending_photos + inserted_items
        total_to_process = len(all_to_process)
        processed_count = 0
        counter_lock = asyncio.Lock()

        async def process_sync_item(item):
            nonlocal processed_count
            photo_id, orig_path, f = item
            async with semaphore:
                async with counter_lock:
                    processed_count += 1
                    current_idx = processed_count
                try:
                    print(f"[{current_idx}/{total_to_process}] Indexing ({storage_type}): {f['name']} (parallel workers: {concurrency})")
                    if storage_type == "local":
                        # Local file is already on disk: zero network copy, zero temp files
                        actual_path = orig_path or provider.get_local_path(f["id"], location)
                        if not actual_path or not os.path.exists(actual_path):
                            await db.execute("UPDATE photos SET status = ? WHERE id = ?",
                                             ("error", photo_id))
                            return

                        await process_photo(
                            photo_id=photo_id,
                            event_id=event_id,
                            event_slug=event["slug"],
                            original_path=actual_path,
                            filename=f["name"],
                            drive_file_id=None,
                            storage_type="local",
                            storage_path=f["id"]
                        )
                    else:
                        # Remote Google Drive download
                        content, filename = await provider.get_photo_bytes(f["id"])
                        if not content:
                            await db.execute("UPDATE photos SET status = ? WHERE id = ?",
                                             ("error", photo_id))
                            return

                        os.makedirs(os.path.dirname(orig_path), exist_ok=True)
                        with open(orig_path, "wb") as buffer:
                            buffer.write(content)

                        await process_photo(
                            photo_id=photo_id,
                            event_id=event_id,
                            event_slug=event["slug"],
                            original_path=orig_path,
                            filename=filename,
                            drive_file_id=f["id"],
                            storage_type="drive",
                            storage_path=None
                        )
                except Exception as loop_err:
                    print(f"Error processing synced photo {f.get('name', photo_id)}: {loop_err}")
                    try:
                        await db.execute("UPDATE photos SET status = ? WHERE id = ?",
                                         ("error", photo_id))
                    except Exception:
                        pass
                finally:
                    if storage_type == "drive" and os.path.exists(orig_path):
                        try:
                            os.remove(orig_path)
                        except Exception:
                            pass
                    await asyncio.sleep(0.01)

        if all_to_process:
            await asyncio.gather(*(process_sync_item(item) for item in all_to_process), return_exceptions=True)

        await db.execute(
            """
            UPDATE events SET sync_status = ?, last_sync_at = ? WHERE id = ?
        """, ("completed", datetime.utcnow().isoformat(), event_id))
        print(f"Sync completed successfully for event: {event_id}")
    except Exception as e:
        print(f"Sync task fatal error: {e}")
        await db.execute("UPDATE events SET sync_status = ? WHERE id = ?",
                         ("error", event_id))
    finally:
        active_sync_events.discard(event_id)


@router.post("/sync/{event_id}")
async def start_sync(event_id: str, background_tasks: BackgroundTasks):
    row = await db.fetch_one(
        "SELECT drive_folder_url, storage_type, storage_path, sync_status FROM events WHERE id = ?", (event_id, ))
    if not row:
        raise HTTPException(status_code=404, detail="Event not found")

    storage_type = (row.get("storage_type") or "drive").lower().strip()
    if storage_type == "local":
        if not row.get("storage_path"):
            raise HTTPException(status_code=400, detail="Local storage path not configured for event")
    else:
        if not row.get("drive_folder_url"):
            raise HTTPException(status_code=400, detail="Drive folder URL not configured for event")

    if event_id in active_sync_events or row.get("sync_status") == "syncing":
        return {
            "message": "Sync is already in progress for this event",
            "sync_status": "syncing"
        }

    background_tasks.add_task(run_sync_task, event_id)
    return {"message": "Sync started in background"}


@router.post("/retry-errors/{event_id}")
async def retry_error_photos(event_id: str, background_tasks: BackgroundTasks):
    """Re-attempts processing for all photos marked as error in an event"""
    error_photos = await db.fetch_all(
        "SELECT id, original_file_name, drive_file_id, storage_type, storage_path FROM photos WHERE event_id = ? AND status = 'error'",
        (event_id,)
    )
    if not error_photos:
        return {"message": "No errored photos found to retry", "count": 0}

    event = await db.fetch_one("SELECT * FROM events WHERE id = ?", (event_id,))
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    event_slug = event["slug"]
    event_storage_type = (event.get("storage_type") or "drive").lower().strip()
    event_location = event.get("storage_path") if event_storage_type == "local" else event.get("drive_folder_url")
    provider = get_storage_provider(event_storage_type)

    async def retry_task():
        concurrency = max(1, getattr(settings, "SYNC_CONCURRENCY", 4))
        semaphore = asyncio.Semaphore(concurrency)

        async def process_retry_item(p):
            photo_id = p["id"]
            p_storage = (p.get("storage_type") or event_storage_type or "drive").lower().strip()
            p_storage_path = p.get("storage_path")
            drive_file_id = p.get("drive_file_id")

            async with semaphore:
                try:
                    if p_storage == "local":
                        loc_path = provider.get_local_path(p_storage_path, event_location)
                        if loc_path and os.path.exists(loc_path):
                            await process_photo(
                                photo_id=photo_id,
                                event_id=event_id,
                                event_slug=event_slug,
                                original_path=loc_path,
                                filename=p["original_file_name"],
                                drive_file_id=None,
                                storage_type="local",
                                storage_path=p_storage_path
                            )
                    else:
                        file_ext = p["original_file_name"].split(".")[-1] if "." in p["original_file_name"] else "jpg"
                        original_path = os.path.join(settings.UPLOAD_ROOT, f"{photo_id}.{file_ext}")
                        if drive_file_id and not os.path.exists(original_path):
                            content, filename = await drive_service.download_file(drive_file_id)
                            if content:
                                with open(original_path, "wb") as buffer:
                                    buffer.write(content)
                        if os.path.exists(original_path):
                            await process_photo(
                                photo_id=photo_id,
                                event_id=event_id,
                                event_slug=event_slug,
                                original_path=original_path,
                                filename=p["original_file_name"],
                                drive_file_id=drive_file_id,
                                storage_type="drive",
                                storage_path=None
                            )
                except Exception as e:
                    print(f"Error retrying photo {photo_id}: {e}")
                    await db.execute("UPDATE photos SET status = 'error' WHERE id = ?", (photo_id,))
                finally:
                    if p_storage == "drive" and drive_file_id and os.path.exists(original_path):
                        try:
                            os.remove(original_path)
                        except Exception:
                            pass
                    await asyncio.sleep(0.01)

        await asyncio.gather(*(process_retry_item(p) for p in error_photos))

    background_tasks.add_task(retry_task)
    return {"message": f"Started re-processing {len(error_photos)} photos", "count": len(error_photos)}


@router.get("/status/{event_id}")
async def get_event_status(event_id: str):
    row = await db.fetch_one("SELECT * FROM events WHERE id = ?", (event_id, ))
    if not row:
        raise HTTPException(status_code=404, detail="Event not found")
    event = dict(row)

    res = await db.fetch_one(
        "SELECT COUNT(*) as total FROM photos WHERE event_id = ?",
        (event_id, ))
    total = res["total"]

    res = await db.fetch_one(
        "SELECT COUNT(*) as pending FROM photos WHERE event_id = ? AND status = 'pending'",
        (event_id, ))
    pending = res["pending"]

    res = await db.fetch_one(
        "SELECT COUNT(*) as processed FROM photos WHERE event_id = ? AND status = 'processed'",
        (event_id, ))
    processed = res["processed"]

    res = await db.fetch_one(
        "SELECT COUNT(*) as errors FROM photos WHERE event_id = ? AND status = 'error'",
        (event_id, ))
    errors = res["errors"]

    res = await db.fetch_one(
        "SELECT SUM(faces_count) as total_faces FROM photos WHERE event_id = ?",
        (event_id, ))
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


@router.get("/event/{event_id}/gallery")
async def get_event_photos(event_id: str, page: int = 1, limit: int = 100):
    """Get all photos for an event with pagination"""
    offset = (page - 1) * limit
    
    # Get total count
    count_result = await db.fetch_one(
        "SELECT COUNT(*) as total FROM photos WHERE event_id = ?",
        (event_id,)
    )
    total = count_result["total"]
    
    # Get photos
    photos = await db.fetch_all(
        """
        SELECT id, original_file_name, thumbnail_path, width, height, 
               faces_count, status, created_at, drive_file_id
        FROM photos 
        WHERE event_id = ?
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
        """,
        (event_id, limit, offset)
    )
    
    return {
        "photos": [
            {
                "id": p["id"],
                "filename": p["original_file_name"],
                "original_file_name": p["original_file_name"],
                "thumbnail_url": f"/photos/thumbnail/{p['id']}",
                "preview_url": f"/photos/preview/{p['id']}",
                "original_url": f"/photos/original/{p['id']}",
                "drive_file_id": p.get("drive_file_id"),
                "faces_count": p.get("faces_count", 0),
                "width": p.get("width"),
                "height": p.get("height"),
                "status": p.get("status"),
                "created_at": p.get("created_at")
            }
            for p in photos
        ],
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": (total + limit - 1) // limit if limit > 0 else 1
    }


@router.get("/public/{slug}/gallery")
async def get_public_event_photos(slug: str, page: int = 1, limit: int = 50):
    """Get public photos for an event by its slug with pagination"""
    event = await db.fetch_one("SELECT id, name, slug, date, secret_code FROM events WHERE slug = ?", (slug,))
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    event_id = event["id"]
    offset = (page - 1) * limit
    
    count_result = await db.fetch_one(
        "SELECT COUNT(*) as total FROM photos WHERE event_id = ? AND status = 'processed'",
        (event_id,)
    )
    total = count_result["total"]
    
    photos = await db.fetch_all(
        """
        SELECT id, original_file_name, thumbnail_path, width, height, 
               faces_count, status, created_at, drive_file_id
        FROM photos 
        WHERE event_id = ? AND status = 'processed'
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
        """,
        (event_id, limit, offset)
    )
    
    return {
        "event": {
            "_id": event["id"],
            "id": event["id"],
            "name": event["name"],
            "slug": event["slug"],
            "date": event["date"],
            "is_protected": bool(event.get("secret_code"))
        },
        "photos": [
            {
                "id": p["id"],
                "filename": p["original_file_name"],
                "thumbnail_url": f"/photos/thumbnail/{p['id']}",
                "preview_url": f"/photos/preview/{p['id']}",
                "original_url": f"/photos/original/{p['id']}",
                "drive_file_id": p.get("drive_file_id"),
                "faces_count": p.get("faces_count", 0),
                "width": p.get("width"),
                "height": p.get("height"),
                "created_at": p.get("created_at")
            }
            for p in photos
        ],
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": (total + limit - 1) // limit if limit > 0 else 1
    }


@router.delete("/delete/{photo_id}")
async def delete_photo(photo_id: str):
    """Delete a single photo and its associated data"""
    photo = await db.fetch_one("SELECT * FROM photos WHERE id = ?", (photo_id,))
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    
    try:
        # Delete original photo files
        for ext in ['jpg', 'jpeg', 'png', 'JPG', 'JPEG', 'PNG', 'webp', 'WEBP']:
            original_path = os.path.join(settings.UPLOAD_ROOT, f"{photo_id}.{ext}")
            if os.path.exists(original_path):
                try:
                    os.remove(original_path)
                except Exception as e:
                    print(f"Error deleting original {original_path}: {e}")
        
        # Delete thumbnail and preview
        thumbnail_path = photo.get("thumbnail_path")
        if thumbnail_path and os.path.exists(thumbnail_path):
            try:
                os.remove(thumbnail_path)
            except Exception as e:
                print(f"Error deleting thumbnail {thumbnail_path}: {e}")
        preview_path = os.path.join(settings.PREVIEWS_ROOT, f"{photo_id}.webp")
        if os.path.exists(preview_path):
            try:
                os.remove(preview_path)
            except Exception as e:
                print(f"Error deleting preview {preview_path}: {e}")
        
        # Delete from database
        await db.execute("DELETE FROM faces WHERE photo_id = ?", (photo_id,))
        await db.execute("DELETE FROM photos WHERE id = ?", (photo_id,))
        
        return {"message": "Photo deleted successfully"}
    except Exception as e:
        print(f"Error deleting photo {photo_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error deleting photo: {str(e)}")


@router.post("/delete/bulk")
async def delete_photos_bulk(photo_ids: List[str]):
    """Delete multiple photos and their associated data"""
    deleted_count = 0
    errors = []
    
    for photo_id in photo_ids:
        try:
            photo = await db.fetch_one("SELECT * FROM photos WHERE id = ?", (photo_id,))
            if not photo:
                errors.append(f"Photo {photo_id} not found")
                continue
            
            # Delete original photo files
            for ext in ['jpg', 'jpeg', 'png', 'JPG', 'JPEG', 'PNG', 'webp', 'WEBP']:
                original_path = os.path.join(settings.UPLOAD_ROOT, f"{photo_id}.{ext}")
                if os.path.exists(original_path):
                    try:
                        os.remove(original_path)
                    except Exception as e:
                        print(f"Error deleting original {original_path}: {e}")
            
            # Delete thumbnail and preview
            thumbnail_path = photo.get("thumbnail_path")
            if thumbnail_path and os.path.exists(thumbnail_path):
                try:
                    os.remove(thumbnail_path)
                except Exception as e:
                    print(f"Error deleting thumbnail {thumbnail_path}: {e}")
            preview_path = os.path.join(settings.PREVIEWS_ROOT, f"{photo_id}.webp")
            if os.path.exists(preview_path):
                try:
                    os.remove(preview_path)
                except Exception as e:
                    print(f"Error deleting preview {preview_path}: {e}")
            
            # Delete from database
            await db.execute("DELETE FROM faces WHERE photo_id = ?", (photo_id,))
            await db.execute("DELETE FROM photos WHERE id = ?", (photo_id,))
            deleted_count += 1
        except Exception as e:
            errors.append(f"Error deleting photo {photo_id}: {str(e)}")
            print(f"Error in bulk delete for {photo_id}: {e}")
    
    return {
        "message": f"Deleted {deleted_count} photos",
        "deleted_count": deleted_count,
        "errors": errors
    }


@router.get("/original/{photo_id}")
async def get_original(photo_id: str):
    row = await db.fetch_one("SELECT * FROM photos WHERE id = ?", (photo_id, ))
    if not row:
        raise HTTPException(status_code=404, detail="Photo not found")
    photo = dict(row)

    # 1. Check local storage provider path
    if photo.get("storage_type") == "local" and photo.get("storage_path"):
        event = await db.fetch_one("SELECT storage_path FROM events WHERE id = ?", (photo["event_id"],))
        base_loc = event.get("storage_path") if event else None
        provider = get_storage_provider("local")
        local_path = provider.get_local_path(photo["storage_path"], base_loc)
        if local_path and os.path.exists(local_path):
            filename = photo.get("original_file_name") or os.path.basename(local_path)
            return FileResponse(local_path, filename=filename)

    # 2. Check local upload cache
    local_path = None
    for ext in ['jpg', 'jpeg', 'png', 'JPG', 'JPEG', 'PNG', 'webp']:
        path = os.path.join(settings.UPLOAD_ROOT, f"{photo_id}.{ext}")
        if os.path.exists(path):
            local_path = path
            break

    if local_path:
        return FileResponse(local_path)

    # 3. Check 2K local preview fallback (e.g. if deployed to server without raw originals)
    preview_path = os.path.join(settings.PREVIEWS_ROOT, f"{photo_id}.webp")
    if os.path.exists(preview_path):
        raw_name = photo.get("original_file_name") or f"{photo_id}.jpg"
        base_name, _ = os.path.splitext(raw_name)
        jpeg_filename = f"{base_name}.jpg"
        try:
            with Image.open(preview_path) as img:
                if img.mode != "RGB":
                    img = img.convert("RGB")
                buf = io.BytesIO()
                img.save(buf, format="JPEG", quality=90, optimize=True)
                jpeg_bytes = buf.getvalue()
            return Response(
                content=jpeg_bytes,
                media_type="image/jpeg",
                headers={
                    "Content-Disposition": f'inline; filename="{jpeg_filename}"',
                    "Content-Length": str(len(jpeg_bytes))
                }
            )
        except Exception as e:
            print(f"Error converting preview to JPEG for get_original {photo_id}: {e}")
            return FileResponse(preview_path, media_type="image/webp", filename=f"{base_name}.webp")

    # 4. Google Drive fallback
    if photo.get("drive_file_id"):
        try:
            content, filename = await drive_service.download_file(
                photo["drive_file_id"])
            if content:
                ext = (filename.rsplit(".", 1)[-1] if "." in filename else "jpg").lower()
                media_type = f"image/{ext}" if ext in ["jpeg", "png", "webp", "gif"] else "image/jpeg"
                return StreamingResponse(io.BytesIO(content),
                                         media_type=media_type)
        except Exception as e:
            print(f"Drive fetch error: {e}")

    raise HTTPException(status_code=404, detail="Original file not found")


@router.get("/preview/{photo_id}")
async def get_preview(photo_id: str):
    """Fast 2K WebP screen preview for instant fullscreen viewing with lazy generation fallback"""
    preview_path = os.path.join(settings.PREVIEWS_ROOT, f"{photo_id}.webp")
    if os.path.exists(preview_path):
        return FileResponse(preview_path, media_type="image/webp")

    # Fetch photo info for lazy backfill
    row = await db.fetch_one("SELECT * FROM photos WHERE id = ?", (photo_id,))
    if not row:
        raise HTTPException(status_code=404, detail="Preview file not found")

    # Fallback 1: If local storage, generate 2K preview on-the-fly directly from local file
    if row.get("storage_type") == "local" and row.get("storage_path"):
        event = await db.fetch_one("SELECT storage_path FROM events WHERE id = ?", (row["event_id"],))
        base_loc = event.get("storage_path") if event else None
        provider = get_storage_provider("local")
        loc_path = provider.get_local_path(row["storage_path"], base_loc)
        if loc_path and os.path.exists(loc_path):
            try:
                await asyncio.to_thread(thumbnail_service.generate_preview, loc_path, preview_path, 2048, 82)
                if os.path.exists(preview_path):
                    return FileResponse(preview_path, media_type="image/webp")
            except Exception as e:
                print(f"Error generating preview from local storage: {e}")

    # Fallback 2: If original exists in UPLOAD_ROOT, generate 2K preview on-the-fly
    for ext in ['jpg', 'jpeg', 'png', 'JPG', 'JPEG', 'PNG', 'webp', 'WEBP']:
        orig_path = os.path.join(settings.UPLOAD_ROOT, f"{photo_id}.{ext}")
        if os.path.exists(orig_path):
            try:
                await asyncio.to_thread(thumbnail_service.generate_preview, orig_path, preview_path, 2048, 82)
                if os.path.exists(preview_path):
                    return FileResponse(preview_path, media_type="image/webp")
            except Exception as e:
                print(f"Error generating preview from local original: {e}")

    # Fallback 3: Lazy on-demand backfill from Google Drive
    if row.get("drive_file_id"):
        try:
            content, _ = await drive_service.download_file(row["drive_file_id"])
            if content:
                temp_orig = os.path.join(settings.UPLOAD_ROOT, f"temp_{photo_id}.tmp")
                os.makedirs(os.path.dirname(temp_orig), exist_ok=True)
                with open(temp_orig, "wb") as f:
                    f.write(content)
                await asyncio.to_thread(thumbnail_service.generate_preview, temp_orig, preview_path, 2048, 82)
                if os.path.exists(temp_orig):
                    try:
                        os.remove(temp_orig)
                    except Exception:
                        pass
                if os.path.exists(preview_path):
                    return FileResponse(preview_path, media_type="image/webp")
        except Exception as drive_err:
            print(f"Lazy preview backfill error for {photo_id}: {drive_err}")

    # Fallback 4: Fall back to thumbnail if available
    thumb_path = os.path.join(settings.THUMBNAIL_ROOT, f"{photo_id}.jpg")
    if os.path.exists(thumb_path):
        return FileResponse(thumb_path, media_type="image/jpeg")

    raise HTTPException(status_code=404, detail="Preview file not found")


@router.get("/thumbnail/{photo_id}")
async def get_thumbnail(photo_id: str):
    row = await db.fetch_one("SELECT * FROM photos WHERE id = ?", (photo_id, ))
    if not row:
        raise HTTPException(status_code=404, detail="Thumbnail not found")

    thumb_path = row.get("thumbnail_path") or os.path.join(settings.THUMBNAIL_ROOT, f"{photo_id}.jpg")
    if os.path.exists(thumb_path):
        return FileResponse(thumb_path)

    # Lazy generate thumbnail if missing and local original exists
    if row.get("storage_type") == "local" and row.get("storage_path"):
        event = await db.fetch_one("SELECT storage_path FROM events WHERE id = ?", (row["event_id"],))
        base_loc = event.get("storage_path") if event else None
        provider = get_storage_provider("local")
        loc_path = provider.get_local_path(row["storage_path"], base_loc)
        if loc_path and os.path.exists(loc_path):
            try:
                await asyncio.to_thread(thumbnail_service.generate_thumbnail, loc_path, thumb_path)
                if os.path.exists(thumb_path):
                    return FileResponse(thumb_path)
            except Exception as e:
                print(f"Error lazy generating thumbnail for {photo_id}: {e}")

    raise HTTPException(status_code=404, detail="Thumbnail file not found on disk")


@router.get("/download/{photo_id}")
async def download_photo(photo_id: str):
    row = await db.fetch_one("SELECT * FROM photos WHERE id = ?", (photo_id,))
    if not row:
        raise HTTPException(status_code=404, detail="Photo not found")

    raw_name = row.get("original_file_name") or f"{photo_id}.jpg"
    base_name, _ = os.path.splitext(raw_name)
    jpeg_filename = f"{base_name}.jpg"

    # 1. Check local storage provider
    if row.get("storage_type") == "local" and row.get("storage_path"):
        event = await db.fetch_one("SELECT storage_path FROM events WHERE id = ?", (row["event_id"],))
        base_loc = event.get("storage_path") if event else None
        provider = get_storage_provider("local")
        local_path = provider.get_local_path(row["storage_path"], base_loc)
        if local_path and os.path.exists(local_path):
            return FileResponse(
                local_path,
                filename=raw_name,
                content_disposition_type="attachment"
            )

    # 2. Check local master original file in UPLOAD_ROOT
    for ext in ['jpg', 'jpeg', 'png', 'JPG', 'JPEG', 'PNG', 'webp', 'WEBP']:
        local_path = os.path.join(settings.UPLOAD_ROOT, f"{photo_id}.{ext}")
        if os.path.exists(local_path):
            return FileResponse(
                local_path,
                filename=raw_name,
                content_disposition_type="attachment"
            )

    # 3. Check 2K local preview and convert to universal JPEG on the fly (~8ms)
    preview_path = os.path.join(settings.PREVIEWS_ROOT, f"{photo_id}.webp")
    if os.path.exists(preview_path):
        try:
            with Image.open(preview_path) as img:
                if img.mode != "RGB":
                    img = img.convert("RGB")
                buf = io.BytesIO()
                img.save(buf, format="JPEG", quality=90, optimize=True)
                jpeg_bytes = buf.getvalue()
            return Response(
                content=jpeg_bytes,
                media_type="image/jpeg",
                headers={
                    "Content-Disposition": f'attachment; filename="{jpeg_filename}"',
                    "Content-Length": str(len(jpeg_bytes))
                }
            )
        except Exception as e:
            print(f"Error converting preview to JPEG for {photo_id}: {e}")

    # 4. Fallback to Google Drive if Drive ID exists
    drive_file_id = row.get("drive_file_id")
    if drive_file_id:
        try:
            content, filename = await drive_service.download_file(drive_file_id)
            if content:
                ext = filename.split(".")[-1] if "." in filename else "jpg"
                cache_path = os.path.join(settings.UPLOAD_ROOT, f"{photo_id}.{ext}")
                with open(cache_path, "wb") as f:
                    f.write(content)
                return Response(
                    content=content,
                    media_type="application/octet-stream",
                    headers={
                        "Content-Disposition": f'attachment; filename="{filename}"',
                        "Content-Length": str(len(content))
                    }
                )
        except Exception as e:
            print(f"Drive download error for {photo_id}: {e}")

    raise HTTPException(status_code=404, detail="Photo file not found")


class BulkDownloadRequest(BaseModel):
    photo_ids: List[str]
    zip_name: Optional[str] = "photos.zip"


async def _generate_bulk_zip(req: BulkDownloadRequest):
    """Streams a ZIP archive containing selected photos in high-resolution universal JPEG"""
    if not req.photo_ids:
        raise HTTPException(status_code=400, detail="No photos selected for download")

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        placeholders = ",".join(["?"] * len(req.photo_ids))
        photo_rows = await db.fetch_all(
            f"SELECT * FROM photos WHERE id IN ({placeholders})", req.photo_ids
        )
        local_provider = get_storage_provider("local")
        events_cache = {}

        for p in photo_rows:
            p_id = p["id"]
            raw_name = p.get("original_file_name") or f"{p_id}.jpg"
            base_name, _ = os.path.splitext(raw_name)
            jpeg_filename = f"{base_name}.jpg"

            # 1. Check if local storage provider has original file
            if p.get("storage_type") == "local" and p.get("storage_path"):
                ev_id = p["event_id"]
                if ev_id not in events_cache:
                    ev_row = await db.fetch_one("SELECT storage_path FROM events WHERE id = ?", (ev_id,))
                    events_cache[ev_id] = ev_row.get("storage_path") if ev_row else None
                base_loc = events_cache[ev_id]
                loc_path = local_provider.get_local_path(p["storage_path"], base_loc)
                if loc_path and os.path.exists(loc_path):
                    zip_file.write(loc_path, raw_name)
                    continue

            # 2. Check local original in UPLOAD_ROOT
            local_path = None
            for ext in ['jpg', 'jpeg', 'png', 'JPG', 'JPEG', 'PNG']:
                path = os.path.join(settings.UPLOAD_ROOT, f"{p_id}.{ext}")
                if os.path.exists(path):
                    local_path = path
                    break

            if local_path:
                zip_file.write(local_path, raw_name)
                continue

            # 3. Check 2K local preview -> convert to universal JPEG
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

            # 4. Fallback to Google Drive if needed
            if p.get("drive_file_id"):
                try:
                    content, filename = await drive_service.download_file(p["drive_file_id"])
                    if content:
                        zip_file.writestr(filename, content)
                except Exception as e:
                    print(f"Zip inclusion error for photo {p_id}: {e}")

    zip_data = zip_buffer.getvalue()
    clean_filename = req.zip_name if req.zip_name.endswith(".zip") else f"{req.zip_name}.zip"
    return Response(
        content=zip_data,
        media_type="application/x-zip-compressed",
        headers={
            "Content-Disposition": f"attachment; filename={clean_filename}",
            "Content-Length": str(len(zip_data))
        }
    )


@router.post("/download-zip")
async def download_photos_bulk_zip(req: BulkDownloadRequest):
    async with bulk_zip_lock:
        return await _generate_bulk_zip(req)

