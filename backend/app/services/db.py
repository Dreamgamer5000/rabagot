import aiosqlite
import os
import json
from app.core.config import get_settings

settings = get_settings()


class Database:
    connection: aiosqlite.Connection = None

    async def connect(self):
        self.connection = await aiosqlite.connect(settings.DB_PATH)
        self.connection.row_factory = aiosqlite.Row
        await self.connection.execute("PRAGMA journal_mode=WAL;")
        await self.connection.execute("PRAGMA busy_timeout=5000;")
        await self._init_tables()

    async def disconnect(self):
        if self.connection:
            await self.connection.close()

    async def _init_tables(self):
        await self.connection.execute("""
            CREATE TABLE IF NOT EXISTS events (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                slug TEXT UNIQUE NOT NULL,
                date TEXT NOT NULL,
                drive_folder_url TEXT,
                storage_type TEXT DEFAULT 'drive',
                storage_path TEXT,
                secret_code TEXT,
                sync_status TEXT DEFAULT 'idle',
                last_sync_at TEXT,
                created_at TEXT NOT NULL
            )
        """)

        await self.connection.execute("""
            CREATE TABLE IF NOT EXISTS photos (
                id TEXT PRIMARY KEY,
                event_id TEXT NOT NULL,
                original_file_name TEXT,
                drive_file_id TEXT,
                storage_type TEXT DEFAULT 'drive',
                storage_path TEXT,
                thumbnail_path TEXT,
                width INTEGER,
                height INTEGER,
                faces_count INTEGER DEFAULT 0,
                status TEXT DEFAULT 'pending',
                created_at TEXT NOT NULL,
                FOREIGN KEY (event_id) REFERENCES events (id)
            )
        """)

        await self.connection.execute("""
            CREATE TABLE IF NOT EXISTS faces (
                id TEXT PRIMARY KEY,
                photo_id TEXT NOT NULL,
                event_id TEXT NOT NULL,
                embedding_vector TEXT NOT NULL,
                bounding_box TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (photo_id) REFERENCES photos (id),
                FOREIGN KEY (event_id) REFERENCES events (id)
            )
        """)

        await self.connection.execute("""
            CREATE TABLE IF NOT EXISTS guests (
                id TEXT PRIMARY KEY,
                event_id TEXT NOT NULL,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                phone TEXT,
                selfie_path TEXT,
                status TEXT DEFAULT 'processing',
                match_count INTEGER DEFAULT 0,
                matched_photo_ids TEXT,
                error TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (event_id) REFERENCES events (id)
            )
        """)

        # Safe non-destructive schema migrations for existing databases
        async with self.connection.execute("PRAGMA table_info(events)") as cursor:
            event_cols = [row[1] for row in await cursor.fetchall()]
            if "storage_type" not in event_cols:
                await self.connection.execute("ALTER TABLE events ADD COLUMN storage_type TEXT DEFAULT 'drive'")
            if "storage_path" not in event_cols:
                await self.connection.execute("ALTER TABLE events ADD COLUMN storage_path TEXT")

        async with self.connection.execute("PRAGMA table_info(photos)") as cursor:
            photo_cols = [row[1] for row in await cursor.fetchall()]
            if "storage_type" not in photo_cols:
                await self.connection.execute("ALTER TABLE photos ADD COLUMN storage_type TEXT DEFAULT 'drive'")
            if "storage_path" not in photo_cols:
                await self.connection.execute("ALTER TABLE photos ADD COLUMN storage_path TEXT")

        await self.connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_photos_event ON photos (event_id)")
        await self.connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_photos_drive ON photos (drive_file_id)"
        )
        await self.connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_faces_event ON faces (event_id)")
        await self.connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_guests_event ON guests (event_id)")
        await self.connection.commit()

    # Helper methods to make API migration easier
    async def fetch_one(self, query, params=()):
        async with self.connection.execute(query, params) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None

    async def fetch_all(self, query, params=()):
        async with self.connection.execute(query, params) as cursor:
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]

    async def execute(self, query, params=()):
        await self.connection.execute(query, params)
        await self.connection.commit()


db = Database()


async def connect_to_db():
    await db.connect()


async def close_db_connection():
    await db.disconnect()
