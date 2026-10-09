import asyncio
import os
import shutil
import urllib.request
import json
import zipfile
import io
from PIL import Image

API_BASE = "http://localhost:8000"

def run_e2e():
    print("=== E2E LOCAL FOLDER PROVIDER TEST ===")
    
    # 1. Create a test directory inside data
    test_dir = "/app/data/e2e_test_event"
    os.makedirs(test_dir, exist_ok=True)
    sub_dir = os.path.join(test_dir, "ceremony")
    os.makedirs(sub_dir, exist_ok=True)

    img1_path = os.path.join(test_dir, "photo_a.jpg")
    img2_path = os.path.join(sub_dir, "photo_b.jpg")

    # Generate 2 valid JPEG images with distinct dimensions
    img1 = Image.new("RGB", (640, 480), color=(200, 50, 50))
    img1.save(img1_path, "JPEG")
    img2 = Image.new("RGB", (800, 600), color=(50, 50, 200))
    img2.save(img2_path, "JPEG")

    print(f"Created sample images in {test_dir}")

    # 2. Test Event Creation via FastAPI
    create_payload = {
        "name": "E2E Local Test Event",
        "slug": f"e2e-local-test-{os.getpid()}",
        "date": "2026-10-08T00:00:00Z",
        "storage_type": "local",
        "storage_path": test_dir
    }

    req = urllib.request.Request(
        f"{API_BASE}/events",
        data=json.dumps(create_payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    with urllib.request.urlopen(req) as resp:
        event_data = json.loads(resp.read().decode("utf-8"))
    
    event_id = event_data["_id"]
    print(f"✓ Event created successfully with ID: {event_id}, storage_type: {event_data.get('storage_type')}")
    assert event_data.get("storage_type") == "local"
    assert event_data.get("storage_path") == test_dir

    # 3. Test Invalid Directory Rejection
    bad_payload = {
        "name": "Bad Event",
        "slug": f"bad-event-{os.getpid()}",
        "date": "2026-10-08T00:00:00Z",
        "storage_type": "local",
        "storage_path": "/invalid_path_that_does_not_exist"
    }
    bad_req = urllib.request.Request(
        f"{API_BASE}/events",
        data=json.dumps(bad_payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    try:
        urllib.request.urlopen(bad_req)
        assert False, "Expected 400 error for invalid directory!"
    except urllib.error.HTTPError as e:
        assert e.code == 400
        print("✓ Non-existent directory correctly rejected with HTTP 400")

    # 4. Trigger Photo Sync
    sync_req = urllib.request.Request(
        f"{API_BASE}/photos/sync/{event_id}",
        data=b"",
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    with urllib.request.urlopen(sync_req) as resp:
        sync_resp = json.loads(resp.read().decode("utf-8"))
        print(f"Sync trigger response: {sync_resp}")

    # Wait for sync background task to complete
    import time
    for i in range(20):
        time.sleep(1)
        status_req = urllib.request.Request(f"{API_BASE}/photos/status/{event_id}")
        with urllib.request.urlopen(status_req) as resp:
            st = json.loads(resp.read().decode("utf-8"))
            if st.get("sync_status") in ("completed", "error"):
                print(f"Sync finished with status: {st.get('sync_status')}")
                break

    # 5. Verify Photos Listed
    photos_req = urllib.request.Request(f"{API_BASE}/photos/event/{event_id}/gallery")
    with urllib.request.urlopen(photos_req) as resp:
        photos_data = json.loads(resp.read().decode("utf-8"))

    photo_items = photos_data.get("photos", [])
    print(f"Total synced photos found: {len(photo_items)}")
    assert len(photo_items) == 2, f"Expected 2 photos, got {len(photo_items)}"

    sample_photo = photo_items[0]
    sample_id = sample_photo["id"]

    # 6. Verify 2K Preview endpoint
    prev_req = urllib.request.Request(f"{API_BASE}/photos/preview/{sample_id}")
    with urllib.request.urlopen(prev_req) as resp:
        prev_bytes = resp.read()
        print(f"✓ 2K Preview served successfully ({len(prev_bytes)} bytes, content-type: {resp.headers.get('content-type')})")
        assert resp.headers.get("content-type") == "image/webp"

    # 7. Verify Thumbnail endpoint
    thumb_req = urllib.request.Request(f"{API_BASE}/photos/thumbnail/{sample_id}")
    with urllib.request.urlopen(thumb_req) as resp:
        thumb_bytes = resp.read()
        print(f"✓ Thumbnail served successfully ({len(thumb_bytes)} bytes)")
        assert len(thumb_bytes) > 0

    # 8. Verify Original file download directly
    orig_req = urllib.request.Request(f"{API_BASE}/photos/original/{sample_id}")
    with urllib.request.urlopen(orig_req) as resp:
        orig_bytes = resp.read()
        print(f"✓ Original photo served directly ({len(orig_bytes)} bytes)")
        assert len(orig_bytes) > 0

    # 9. Verify Bulk ZIP Download
    zip_payload = {
        "photo_ids": [p["id"] for p in photo_items],
        "zip_name": "test_local_event.zip"
    }
    zip_req = urllib.request.Request(
        f"{API_BASE}/photos/download-zip",
        data=json.dumps(zip_payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    with urllib.request.urlopen(zip_req) as resp:
        zip_bytes = resp.read()
        assert resp.headers.get("content-type") == "application/x-zip-compressed"
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
            names = z.namelist()
            print(f"✓ ZIP package verified! Contained files: {names}")
            assert len(names) == 2

    # 10. Verify original files on local disk WERE NOT DELETED
    assert os.path.exists(img1_path), "CRITICAL ERROR: Original photo_a.jpg was deleted!"
    assert os.path.exists(img2_path), "CRITICAL ERROR: Original photo_b.jpg was deleted!"
    print("✓ VERIFIED: Original local disk files were preserved intact!")

    # 11. Clean up test event and files
    del_req = urllib.request.Request(
        f"{API_BASE}/events/{event_id}",
        method="DELETE"
    )
    try:
        urllib.request.urlopen(del_req)
        print("✓ Test event deleted from database")
    except Exception as e:
        print(f"Note deleting event: {e}")

    shutil.rmtree(test_dir, ignore_errors=True)
    print("=== ALL E2E TESTS PASSED SUCCESSFULLY! ===")

if __name__ == "__main__":
    run_e2e()
