import asyncio
import os
import shutil
import tempfile
from PIL import Image
from app.services.storage import get_storage_provider, LocalStorageProvider
from app.services.db import db

async def test():
    print("--- 1. Testing LocalStorageProvider ---")
    local_provider = get_storage_provider("local")
    assert isinstance(local_provider, LocalStorageProvider)

    # Create a temporary directory with nested test images
    temp_dir = tempfile.mkdtemp(prefix="picshare_test_")
    sub_dir = os.path.join(temp_dir, "reception")
    os.makedirs(sub_dir, exist_ok=True)

    img1_path = os.path.join(temp_dir, "test1.jpg")
    img2_path = os.path.join(sub_dir, "test2.png")
    text_file = os.path.join(temp_dir, "notes.txt")

    # Generate dummy test images
    img1 = Image.new("RGB", (100, 100), color="red")
    img1.save(img1_path)
    img2 = Image.new("RGB", (200, 200), color="blue")
    img2.save(img2_path)
    with open(text_file, "w") as f:
        f.write("ignore me")

    # Test directory resolution
    resolved = local_provider.resolve_directory(temp_dir)
    assert resolved == os.path.abspath(temp_dir), f"Expected {os.path.abspath(temp_dir)}, got {resolved}"

    # Test non-existent directory
    assert local_provider.resolve_directory("/non_existent_dir_12345") is None

    # Test listing photos
    photos = await local_provider.list_photos(temp_dir)
    assert len(photos) == 2, f"Expected 2 photos, found {len(photos)}"
    photo_ids = {p["id"] for p in photos}
    assert "test1.jpg" in photo_ids
    assert "reception/test2.png" in photo_ids

    # Test getting photo bytes
    data, filename = await local_provider.get_photo_bytes(img1_path)
    assert data is not None and len(data) > 0
    assert filename == "test1.jpg"

    # Test resolving local path with base location
    res_path = local_provider.get_local_path("reception/test2.png", base_location=temp_dir)
    assert res_path == os.path.abspath(img2_path)

    print("✓ LocalStorageProvider verified successfully!")

    print("--- 2. Testing Database Migration & Schema ---")
    await db.connect()
    
    # Verify columns exist in events table
    async with db.connection.execute("PRAGMA table_info(events)") as cursor:
        cols = {row[1] for row in await cursor.fetchall()}
        assert "storage_type" in cols, "storage_type column missing from events"
        assert "storage_path" in cols, "storage_path column missing from events"

    # Verify columns exist in photos table
    async with db.connection.execute("PRAGMA table_info(photos)") as cursor:
        cols = {row[1] for row in await cursor.fetchall()}
        assert "storage_type" in cols, "storage_type column missing from photos"
        assert "storage_path" in cols, "storage_path column missing from photos"

    print("✓ Database columns and migrations verified successfully!")

    # Clean up test temp files
    shutil.rmtree(temp_dir)
    await db.disconnect()
    print("All tests passed!")

if __name__ == "__main__":
    asyncio.run(test())
