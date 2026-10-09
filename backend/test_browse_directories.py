import asyncio
import os
import requests
from app.api.auth import create_access_token

def test_browse():
    base_url = "http://localhost:8000"
    token = create_access_token(data={"sub": "admin"})
    headers = {"Authorization": f"Bearer {token}"}
    
    # 1. Test unauthorized access
    unauth_res = requests.get(f"{base_url}/events/browse-directories")
    assert unauth_res.status_code == 401, f"Expected 401, got {unauth_res.status_code}"
    print("✓ Unauthorized requests correctly rejected (401)")
    
    # 2. Test browsing default root
    res = requests.get(f"{base_url}/events/browse-directories", headers=headers)
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    data = res.json()
    assert "current_path" in data
    assert "breadcrumbs" in data
    assert "quick_links" in data
    assert "directories" in data
    assert isinstance(data["directories"], list)
    print(f"✓ Default browse succeeded at: {data['current_path']}")
    print(f"  Quick links: {[q['name'] for q in data['quick_links']]}")
    print(f"  Subdirectories found: {len(data['directories'])}")
    
    # 3. Test browsing a specific test path
    os.makedirs("data/test_browse_folder/sub1", exist_ok=True)
    os.makedirs("data/test_browse_folder/sub2", exist_ok=True)
    with open("data/test_browse_folder/sub1/pic1.jpg", "wb") as f:
        f.write(b"dummy")
    with open("data/test_browse_folder/pic_root.png", "wb") as f:
        f.write(b"dummy")
        
    res_sub = requests.get(f"{base_url}/events/browse-directories?path=data/test_browse_folder", headers=headers)
    assert res_sub.status_code == 200
    sub_data = res_sub.json()
    assert sub_data["photos_count"] == 1, f"Expected 1 photo in root, got {sub_data['photos_count']}"
    sub1_entry = next((d for d in sub_data["directories"] if d["name"] == "sub1"), None)
    assert sub1_entry is not None, "sub1 directory should be found"
    assert sub1_entry["photos_count"] == 1, f"sub1 should report 1 photo, got {sub1_entry['photos_count']}"
    print("✓ Subdirectory scanning & photo counting verified successfully")

if __name__ == "__main__":
    test_browse()
    print("All directory browsing backend tests passed!")
