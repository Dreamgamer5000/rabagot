import uuid
import json
from datetime import datetime
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional
from app.services.db import db

router = APIRouter(prefix="/events", tags=["events"],)

class EventCreate(BaseModel):
    name: str
    slug: str
    date: datetime
    storage_type: Optional[str] = "drive"
    storage_path: Optional[str] = None
    drive_folder_url: Optional[str] = None
    secret_code: Optional[str] = None

class EventResponse(BaseModel):
    id: str = Field(alias="_id")
    name: str
    slug: str
    date: datetime
    storage_type: Optional[str] = "drive"
    storage_path: Optional[str] = None
    drive_folder_url: Optional[str] = None
    secret_code: Optional[str] = None
    created_at: datetime
    sync_status: str = "idle" # idle, syncing, completed, error
    last_sync_at: Optional[datetime] = None

    class Config:
        populate_by_name = True

class PublicEventResponse(BaseModel):
    id: str = Field(alias="_id")
    name: str
    slug: str
    date: datetime
    is_protected: bool
    created_at: datetime

    class Config:
        populate_by_name = True

def format_event(row):
    if not row: return None
    d = dict(row)
    # Map 'id' to '_id' for frontend compatibility
    d["_id"] = d.pop("id")
    
    # Handle ISO strings to datetime objects for Pydantic
    if d.get("date"):
        d["date"] = datetime.fromisoformat(d["date"])
    if d.get("created_at"):
        d["created_at"] = datetime.fromisoformat(d["created_at"])
    if d.get("last_sync_at"):
        d["last_sync_at"] = datetime.fromisoformat(d["last_sync_at"])
    
    # Add protection flag
    d["is_protected"] = bool(d.get("secret_code"))
    return d

@router.get("/public/list", response_model=List[PublicEventResponse])
async def list_public_events():
    rows = await db.fetch_all("SELECT * FROM events ORDER BY date DESC")
    return [format_event(row) for row in rows]

@router.get("/public/{slug}", response_model=PublicEventResponse)
async def get_public_event(slug: str):
    row = await db.fetch_one("SELECT * FROM events WHERE slug = ?", (slug,))
    if not row:
        raise HTTPException(status_code=404, detail="Event not found")
    return format_event(row)

class CodeVerify(BaseModel):
    slug: str
    code: str

@router.post("/verify")
async def verify_event_code(data: CodeVerify):
    row = await db.fetch_one("SELECT * FROM events WHERE slug = ?", (data.slug,))
    if not row:
        raise HTTPException(status_code=404, detail="Event not found")
    
    event = format_event(row)
    if event.get("secret_code") and event["secret_code"] != data.code:
        raise HTTPException(status_code=401, detail="Invalid secret code")
    
    return {"status": "success", "event": event}

@router.post("", response_model=EventResponse)
@router.post("/", response_model=EventResponse)
async def create_event(event: EventCreate):
    # Check if slug exists
    existing = await db.fetch_one("SELECT id FROM events WHERE slug = ?", (event.slug,))
    if existing:
        raise HTTPException(status_code=400, detail="Slug already exists")
    
    storage_type = (event.storage_type or "drive").lower().strip()
    if storage_type == "local":
        if not event.storage_path or not event.storage_path.strip():
            raise HTTPException(status_code=400, detail="Local directory path is required when storage_type is 'local'")
        from app.services.storage.factory import get_storage_provider
        provider = get_storage_provider("local")
        resolved = provider.resolve_directory(event.storage_path)
        if not resolved:
            raise HTTPException(
                status_code=400,
                detail=f"Directory does not exist or is not accessible on server: {event.storage_path}"
            )
    else:
        storage_type = "drive"
    
    event_id = str(uuid.uuid4())
    created_at = datetime.utcnow().isoformat()
    
    await db.execute("""
        INSERT INTO events (id, name, slug, date, drive_folder_url, storage_type, storage_path, secret_code, sync_status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        event_id, 
        event.name, 
        event.slug, 
        event.date.isoformat(), 
        event.drive_folder_url,
        storage_type,
        event.storage_path,
        event.secret_code,
        "idle", 
        created_at
    ))
    
    row = await db.fetch_one("SELECT * FROM events WHERE id = ?", (event_id,))
    return format_event(row)

@router.get("", response_model=List[EventResponse])
@router.get("/", response_model=List[EventResponse])
async def list_events():
    rows = await db.fetch_all("SELECT * FROM events ORDER BY created_at DESC")
    return [format_event(row) for row in rows]

ALLOWED_UPDATE_FIELDS = {
    "name", "slug", "date", "drive_folder_url", "storage_type", "storage_path", "secret_code"
}

@router.put("/{event_id}", response_model=EventResponse)
async def update_event(event_id: str, event_data: dict):
    # event_data comes as a dict from frontend
    existing = await db.fetch_one("SELECT id FROM events WHERE id = ?", (event_id,))
    if not existing:
        raise HTTPException(status_code=404, detail="Event not found")
    
    if not event_data:
        raise HTTPException(status_code=400, detail="No data to update")

    # Validate storage_path if updating to local
    target_storage_type = event_data.get("storage_type", existing.get("storage_type", "drive"))
    target_storage_type = (target_storage_type or "drive").lower().strip()
    if target_storage_type == "local" and "storage_path" in event_data:
        path_to_check = event_data.get("storage_path")
        if not path_to_check:
            raise HTTPException(status_code=400, detail="Local directory path is required when storage_type is 'local'")
        from app.services.storage.factory import get_storage_provider
        provider = get_storage_provider("local")
        if not provider.resolve_directory(path_to_check):
            raise HTTPException(
                status_code=400,
                detail=f"Directory does not exist or is not accessible on server: {path_to_check}"
            )

    # Build update query dynamically
    fields = []
    params = []
    for key, value in event_data.items():
        if key not in ALLOWED_UPDATE_FIELDS:
            continue
        
        # Normalize secret_code: empty string or whitespace becomes None (SQL NULL)
        if key == "secret_code":
            if isinstance(value, str):
                value = value.strip() or None
            elif not value:
                value = None

        fields.append(f"{key} = ?")
        if isinstance(value, datetime):
            params.append(value.isoformat())
        else:
            params.append(value)
    
    if not fields:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    params.append(event_id)
    query = f"UPDATE events SET {', '.join(fields)} WHERE id = ?"
    
    await db.execute(query, params)
    
    updated = await db.fetch_one("SELECT * FROM events WHERE id = ?", (event_id,))
    return format_event(updated)

@router.get("/{event_id}", response_model=EventResponse)
async def get_event(event_id: str):
    row = await db.fetch_one("SELECT * FROM events WHERE id = ?", (event_id,))
    if not row:
        raise HTTPException(status_code=404, detail="Event not found")
    return format_event(row)

@router.get("/{event_id}/storage")
async def get_event_storage(event_id: str):
    """Get storage usage information for an event"""
    import os
    import shutil
    from app.core.config import get_settings
    
    settings = get_settings()
    
    # Check if event exists
    event = await db.fetch_one("SELECT * FROM events WHERE id = ?", (event_id,))
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Calculate storage used by this event
    event_storage = 0
    thumbnails_storage = 0
    previews_storage = 0
    originals_storage = 0
    cloud_photos_count = 0
    
    # 1. Calculate photos storage
    photos = await db.fetch_all("SELECT * FROM photos WHERE event_id = ?", (event_id,))
    for photo in photos:
        photo_id = photo["id"]
        if photo.get("storage_type") != "local" and photo.get("drive_file_id"):
            cloud_photos_count += 1
        
        # Check original photo files if local storage or if cached locally in uploads
        found_orig = False
        if photo.get("storage_type") == "local" and photo.get("storage_path"):
            loc_path = photo["storage_path"]
            if not os.path.isabs(loc_path) and event.get("storage_path"):
                loc_path = os.path.join(event["storage_path"], loc_path)
            if os.path.exists(loc_path):
                file_size = os.path.getsize(loc_path)
                originals_storage += file_size
                event_storage += file_size
                found_orig = True

        if not found_orig:
            for ext in ['jpg', 'jpeg', 'png', 'JPG', 'JPEG', 'PNG', 'webp', 'WEBP']:
                original_path = os.path.join(settings.UPLOAD_ROOT, f"{photo_id}.{ext}")
                if os.path.exists(original_path):
                    file_size = os.path.getsize(original_path)
                    originals_storage += file_size
                    event_storage += file_size
                    break
        
        # Check thumbnail files
        thumbnail_path = photo.get("thumbnail_path")
        if thumbnail_path and os.path.exists(thumbnail_path):
            file_size = os.path.getsize(thumbnail_path)
            thumbnails_storage += file_size
            event_storage += file_size

        # Check 2K preview files
        preview_path = os.path.join(settings.PREVIEWS_ROOT, f"{photo_id}.webp")
        if os.path.exists(preview_path):
            file_size = os.path.getsize(preview_path)
            previews_storage += file_size
            event_storage += file_size
    
    # 2. Calculate guest selfies storage
    selfies_storage = 0
    guests = await db.fetch_all("SELECT * FROM guests WHERE event_id = ?", (event_id,))
    for guest in guests:
        selfie_path = guest.get("selfie_path")
        if selfie_path and os.path.exists(selfie_path):
            file_size = os.path.getsize(selfie_path)
            selfies_storage += file_size
            event_storage += file_size
    
    # 3. Get system storage information
    try:
        # Get disk usage for the data directory
        data_path = os.path.dirname(settings.DB_PATH)
        if not os.path.exists(data_path):
            data_path = "."
        
        disk_usage = shutil.disk_usage(data_path)
        total_storage = disk_usage.total
        free_storage = disk_usage.free
        used_storage = disk_usage.used
    except Exception as e:
        print(f"Error getting disk usage: {e}")
        total_storage = 0
        free_storage = 0
        used_storage = 0
    
    return {
        "event_id": event_id,
        "event_storage_bytes": event_storage,
        "event_storage_mb": round(event_storage / (1024 * 1024), 2),
        "event_storage_gb": round(event_storage / (1024 * 1024 * 1024), 2),
        "thumbnails_storage_bytes": thumbnails_storage,
        "previews_storage_bytes": previews_storage,
        "originals_storage_bytes": originals_storage,
        "selfies_storage_bytes": selfies_storage,
        "cloud_photos_count": cloud_photos_count,
        "total_storage_bytes": total_storage,
        "total_storage_gb": round(total_storage / (1024 * 1024 * 1024), 2),
        "free_storage_bytes": free_storage,
        "free_storage_gb": round(free_storage / (1024 * 1024 * 1024), 2),
        "used_storage_bytes": used_storage,
        "used_storage_gb": round(used_storage / (1024 * 1024 * 1024), 2),
        "photo_count": len(photos),
        "guest_count": len(guests)
    }

@router.delete("/{event_id}")
async def delete_event(event_id: str):
    """Delete an event and all associated data (photos, faces, guests, files)"""
    import os
    import shutil
    from app.core.config import get_settings
    
    settings = get_settings()
    
    # Check if event exists
    event = await db.fetch_one("SELECT * FROM events WHERE id = ?", (event_id,))
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    try:
        # Get all photos for this event to delete their files
        photos = await db.fetch_all("SELECT * FROM photos WHERE event_id = ?", (event_id,))
        
        for photo in photos:
            photo_id = photo["id"]
            
            # Delete original photo files (try multiple extensions)
            for ext in ['jpg', 'jpeg', 'png', 'JPG', 'JPEG', 'PNG', 'webp', 'WEBP']:
                original_path = os.path.join(settings.UPLOAD_ROOT, f"{photo_id}.{ext}")
                if os.path.exists(original_path):
                    try:
                        os.remove(original_path)
                    except Exception as e:
                        print(f"Error deleting original {original_path}: {e}")
            
            # Delete thumbnail files
            thumbnail_path = photo.get("thumbnail_path")
            if thumbnail_path and os.path.exists(thumbnail_path):
                try:
                    os.remove(thumbnail_path)
                except Exception as e:
                    print(f"Error deleting thumbnail {thumbnail_path}: {e}")
        
        # Get all guests for this event to delete their selfies
        guests = await db.fetch_all("SELECT * FROM guests WHERE event_id = ?", (event_id,))
        
        for guest in guests:
            selfie_path = guest.get("selfie_path")
            if selfie_path and os.path.exists(selfie_path):
                try:
                    os.remove(selfie_path)
                except Exception as e:
                    print(f"Error deleting selfie {selfie_path}: {e}")
        
        # Delete from database (in correct order due to foreign keys)
        await db.execute("DELETE FROM faces WHERE event_id = ?", (event_id,))
        await db.execute("DELETE FROM photos WHERE event_id = ?", (event_id,))
        await db.execute("DELETE FROM guests WHERE event_id = ?", (event_id,))
        await db.execute("DELETE FROM events WHERE id = ?", (event_id,))
        
        return {
            "message": "Event deleted successfully",
            "deleted_photos": len(photos),
            "deleted_guests": len(guests)
        }
        
    except Exception as e:
        print(f"Error deleting event {event_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error deleting event: {str(e)}")
