import uuid
import json
from datetime import datetime
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional
from app.services.db import db

router = APIRouter(prefix="/events", tags=["events"])

class EventCreate(BaseModel):
    name: str
    slug: str
    date: datetime
    drive_folder_url: Optional[str] = None
    secret_code: Optional[str] = None

class EventResponse(BaseModel):
    id: str = Field(alias="_id")
    name: str
    slug: str
    date: datetime
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

@router.post("/", response_model=EventResponse)
async def create_event(event: EventCreate):
    # Check if slug exists
    existing = await db.fetch_one("SELECT id FROM events WHERE slug = ?", (event.slug,))
    if existing:
        raise HTTPException(status_code=400, detail="Slug already exists")
    
    event_id = str(uuid.uuid4())
    created_at = datetime.utcnow().isoformat()
    
    await db.execute("""
        INSERT INTO events (id, name, slug, date, drive_folder_url, secret_code, sync_status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        event_id, 
        event.name, 
        event.slug, 
        event.date.isoformat(), 
        event.drive_folder_url,
        event.secret_code,
        "idle", 
        created_at
    ))
    
    row = await db.fetch_one("SELECT * FROM events WHERE id = ?", (event_id,))
    return format_event(row)

@router.get("/", response_model=List[EventResponse])
async def list_events():
    rows = await db.fetch_all("SELECT * FROM events ORDER BY created_at DESC")
    return [format_event(row) for row in rows]

@router.put("/{event_id}", response_model=EventResponse)
async def update_event(event_id: str, event_data: dict):
    # event_data comes as a dict from frontend
    existing = await db.fetch_one("SELECT id FROM events WHERE id = ?", (event_id,))
    if not existing:
        raise HTTPException(status_code=404, detail="Event not found")
    
    if not event_data:
        raise HTTPException(status_code=400, detail="No data to update")

    # Build update query dynamically
    fields = []
    params = []
    for key, value in event_data.items():
        # Map frontend _id back to id if necessary, but usually we don't update ID
        if key == "_id": continue 
        
        fields.append(f"{key} = ?")
        if isinstance(value, datetime):
            params.append(value.isoformat())
        else:
            params.append(value)
    
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
