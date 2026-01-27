from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.api import events, photos, guests, auth
from app.services.db import connect_to_db, close_db_connection
from app.core.config import get_settings

@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_to_db()
    yield
    await close_db_connection()

settings = get_settings()

app = FastAPI(title="Drive Photo Sharing API", lifespan=lifespan)

# Setup CORS with origins from settings 
origins = [o.strip() for o in settings.ALLOWED_ORIGINS.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(events.router)
app.include_router(photos.router)
app.include_router(guests.router)

@app.get("/")
def read_root():
    return {"message": "Drive Photo Sharing API is running"}
