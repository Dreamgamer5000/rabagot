import os
import asyncio
from typing import List, Dict, Any, Tuple, Optional
from app.services.storage.provider import StorageProvider

SUPPORTED_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".bmp", ".tiff", ".tif", ".avif"
}

IGNORED_DIR_NAMES = {
    ".git", ".svn", ".hg", "__pycache__", ".agents", "@eadir", ".thumbnails", ".previews"
}


class LocalStorageProvider(StorageProvider):
    """
    Storage provider implementation for local directories, mounted drives, or NAS folders.
    """

    def resolve_directory(self, location: str) -> Optional[str]:
        """Validates and returns the normalized absolute directory path."""
        if not location:
            return None
        abs_path = os.path.abspath(os.path.expanduser(location.strip()))
        if os.path.exists(abs_path) and os.path.isdir(abs_path):
            return abs_path
        return None

    async def list_photos(self, location: str) -> List[Dict[str, Any]]:
        """
        Recursively scans the local folder for supported image files.
        """
        resolved_root = self.resolve_directory(location)
        if not resolved_root:
            print(f"[LocalStorageProvider] Directory not found or inaccessible: {location}")
            return []

        def _scan():
            items = []
            for root, dirs, files in os.walk(resolved_root, followlinks=True):
                # Filter out hidden or system directories in-place
                dirs[:] = [
                    d for d in dirs
                    if not d.startswith(".") and d.lower() not in IGNORED_DIR_NAMES
                ]

                for f in files:
                    if f.startswith("."):
                        continue
                    ext = os.path.splitext(f)[1].lower()
                    if ext in SUPPORTED_EXTENSIONS:
                        full_path = os.path.join(root, f)
                        rel_path = os.path.relpath(full_path, resolved_root).replace("\\", "/")
                        try:
                            f_size = os.path.getsize(full_path)
                        except Exception:
                            f_size = None

                        items.append({
                            "id": rel_path,
                            "name": f,
                            "path": full_path,
                            "size": f_size
                        })
            items.sort(key=lambda x: x["name"].lower())
            return items

        return await asyncio.to_thread(_scan)

    async def get_photo_bytes(self, identifier: str) -> Tuple[Optional[bytes], str]:
        """
        Reads photo binary content from local disk.
        """
        local_path = self.get_local_path(identifier)
        if not local_path or not os.path.exists(local_path):
            return None, "photo.jpg"

        def _read():
            with open(local_path, "rb") as f:
                return f.read()

        data = await asyncio.to_thread(_read)
        filename = os.path.basename(local_path)
        return data, filename

    def get_local_path(self, identifier: str, base_location: Optional[str] = None) -> Optional[str]:
        """
        Resolves the local absolute path from identifier and optional base_location.
        """
        if not identifier:
            return None

        # Check if identifier is already an absolute path on disk
        if os.path.isabs(identifier) and os.path.exists(identifier):
            return os.path.abspath(identifier)

        # Check relative to base_location if provided
        if base_location:
            candidate = os.path.join(base_location, identifier)
            if os.path.exists(candidate):
                return os.path.abspath(candidate)

        # Check direct path relative to current working directory
        if os.path.exists(identifier):
            return os.path.abspath(identifier)

        return None
