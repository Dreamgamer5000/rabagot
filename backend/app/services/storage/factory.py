from app.services.storage.provider import StorageProvider
from app.services.storage.drive_provider import GoogleDriveStorageProvider
from app.services.storage.local_provider import LocalStorageProvider

_drive_provider = GoogleDriveStorageProvider()
_local_provider = LocalStorageProvider()


def get_storage_provider(storage_type: str = "drive") -> StorageProvider:
    """
    Returns the appropriate storage provider instance.
    Defaults to GoogleDriveStorageProvider if storage_type is 'drive' or unrecognized.
    """
    normalized = (storage_type or "drive").lower().strip()
    if normalized in ("local", "local_folder", "filesystem"):
        return _local_provider
    return _drive_provider
