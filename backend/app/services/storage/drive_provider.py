from typing import List, Dict, Any, Tuple, Optional
from app.services.storage.provider import StorageProvider
from app.services.drive_service import drive_service


class GoogleDriveStorageProvider(StorageProvider):
    """
    Storage provider implementation for Google Drive.
    """

    async def list_photos(self, location: str) -> List[Dict[str, Any]]:
        folder_id = drive_service.get_folder_id_from_url(location)
        if not folder_id:
            return []
        files = await drive_service.list_files_recursive(folder_id)
        results = []
        for f in files:
            results.append({
                "id": f["id"],
                "name": f.get("name", "photo.jpg"),
                "path": None,
                "size": int(f["size"]) if f.get("size") else None
            })
        return results

    async def get_photo_bytes(self, identifier: str) -> Tuple[Optional[bytes], str]:
        return await drive_service.download_file(identifier)

    def get_local_path(self, identifier: str, base_location: Optional[str] = None) -> Optional[str]:
        # Google Drive photos are remote unless cached locally
        return None
