from abc import ABC, abstractmethod
from typing import List, Dict, Any, Tuple, Optional


class StorageProvider(ABC):
    """
    Abstract base class for photo storage backends (Google Drive, Local Folders, Immich, etc.).
    """

    @abstractmethod
    async def list_photos(self, location: str) -> List[Dict[str, Any]]:
        """
        Recursively discovers all image files at location.
        Returns a list of dicts:
        [
            {
                "id": str,              # Provider-specific unique identifier or relative path
                "name": str,            # Human-readable filename (e.g. 'DSC_001.jpg')
                "path": Optional[str],  # Local path if stored on disk, otherwise None
                "size": Optional[int]   # File size in bytes if known
            }
        ]
        """
        pass

    @abstractmethod
    async def get_photo_bytes(self, identifier: str) -> Tuple[Optional[bytes], str]:
        """
        Retrieves the raw binary bytes and filename for the given photo identifier.
        """
        pass

    @abstractmethod
    def get_local_path(self, identifier: str, base_location: Optional[str] = None) -> Optional[str]:
        """
        Returns the absolute local filesystem path if available, or None if remote.
        """
        pass
