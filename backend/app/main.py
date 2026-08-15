import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import events, photos, guests, auth
from app.services.db import connect_to_db, close_db_connection
from app.core.config import get_settings
from subprocess import Popen

@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_to_db()
    
    # NOTE: Recovery tasks and cron jobs are now run in a separate process 
    # via cron_worker.py to avoid duplication when running multiple workers.
    
    yield
    await close_db_connection()

settings = get_settings()

app = FastAPI(title="Drive Photo Sharing API", lifespan=lifespan, redirect_slashes=False,)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Length"],
    allow_credentials=True,
)


app.include_router(auth.router)
app.include_router(events.router)
app.include_router(photos.router)
app.include_router(guests.router)

# Also mount with /api prefix for proxy rewrite compatibility
app.include_router(auth.router, prefix="/api")
app.include_router(events.router, prefix="/api")
app.include_router(photos.router, prefix="/api")
app.include_router(guests.router, prefix="/api")

@app.get("/")
@app.get("/api")
def read_root():
    return {"message": "Drive Photo Sharing API is running"}
