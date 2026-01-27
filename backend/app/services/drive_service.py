import os
import io
import asyncio
import random
import glob
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from app.core.config import get_settings

settings = get_settings()

class DriveService:
    def __init__(self):
        self.creds = None
        self.service = None
        # We will authenticate on demand to pick random accounts
    
    def _get_random_service(self):
        """Picks a random service account from the configured directory and returns a drive service object."""
        accounts = glob.glob(os.path.join(settings.SERVICE_ACCOUNTS_DIR, "*.json"))
        
        if not accounts:
            # Fallback to single credentials file if directory is empty or not found
            creds_path = os.path.join(os.getcwd(), settings.GOOGLE_CREDENTIALS_FILE)
            if not os.path.exists(creds_path):
                print(f"ERROR: No service accounts found in {settings.SERVICE_ACCOUNTS_DIR} or {creds_path}")
                return None
            selected_account = creds_path
        else:
            selected_account = random.choice(accounts)

        creds = service_account.Credentials.from_service_account_file(
            selected_account, 
            scopes=['https://www.googleapis.com/auth/drive']
        )
        return build('drive', 'v3', credentials=creds)

    def _create_folder_sync(self, service, name: str, actual_parent: str):
        file_metadata = {
            'name': name,
            'mimeType': 'application/vnd.google-apps.folder'
        }
        if actual_parent:
            file_metadata['parents'] = [actual_parent]
        return service.files().create(body=file_metadata, fields='id').execute().get('id')

    async def get_or_create_event_folder(self, event_slug: str):
        service = self._get_random_service()
        if not service: return None
        
        # 1. Get or create event folder directly under the designated DRIVE_FOLDER_ID
        event_folder_id = await asyncio.to_thread(self._get_folder_id_sync, service, event_slug)
        if not event_folder_id:
            event_folder_id = await asyncio.to_thread(self._create_folder_sync, service, event_slug, settings.DRIVE_FOLDER_ID)
            # Create subfolders
            await asyncio.to_thread(self._create_folder_sync, service, "All-Photos", event_folder_id)
            await asyncio.to_thread(self._create_folder_sync, service, "Guests", event_folder_id)
            
        return event_folder_id

    def _get_folder_id_sync(self, service, name: str, parent_id: str = None):
        query = f"name = '{name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
        actual_parent = parent_id or settings.DRIVE_FOLDER_ID
        if actual_parent:
            query += f" and '{actual_parent}' in parents"
        
        results = service.files().list(q=query, spaces='drive', fields='files(id, name)').execute()
        files = results.get('files', [])
        return files[0]['id'] if files else None

    async def upload_photo(self, file_path: str, event_slug: str, subfolder: str = "All-Photos", filename: str = None):
        service = self._get_random_service()
        if not service: return None
        
        event_folder_id = await self.get_or_create_event_folder(event_slug)
        subfolder_id = await asyncio.to_thread(self._get_folder_id_sync, service, subfolder, event_folder_id)
        
        file_name = filename if filename else os.path.basename(file_path)
        file_metadata = {'name': file_name, 'parents': [subfolder_id]}
        media = MediaFileUpload(file_path, resumable=True)
        
        # Offload the blocking upload
        file = await asyncio.to_thread(service.files().create(body=file_metadata, media_body=media, fields='id').execute)
        return file.get('id')

    async def download_file(self, file_id: str):
        service = self._get_random_service()
        if not service: return None, None
        
        # Get metadata to get the filename
        file_metadata = await asyncio.to_thread(service.files().get(fileId=file_id, fields='name').execute)
        filename = file_metadata.get('name', 'photo.jpg')
        
        # Download the actual file content
        from googleapiclient.http import MediaIoBaseDownload
        request = service.files().get_media(fileId=file_id)
        fh = io.BytesIO()
        downloader = MediaIoBaseDownload(fh, request)
        done = False
        while done is False:
            # downloader.next_chunk() is blocking
            status, done = await asyncio.to_thread(downloader.next_chunk)
        
        return fh.getvalue(), filename

    def get_folder_id_from_url(self, url: str):
        """Extracts folder ID from a variety of Google Drive URL formats."""
        if not url: return None
        import re
        # Support /folders/ID or ?id=ID formats
        match = re.search(r'folders/([a-zA-Z0-9-_]+)', url)
        if match: return match.group(1)
        match = re.search(r'id=([a-zA-Z0-9-_]+)', url)
        if match: return match.group(1)
        return url # Assume it's already an ID if no match

    async def list_files_recursive(self, folder_id: str):
        """Recursively lists all files in a folder and its subfolders with pagination support."""
        service = self._get_random_service()
        if not service: return []
        
        all_files = []
        
        async def _walk(current_folder_id, folder_name="root"):
            print(f"Scanning Drive folder: {folder_name} ({current_folder_id})")
            query = f"'{current_folder_id}' in parents and trashed = false"
            page_token = None
            
            while True:
                try:
                    results = await asyncio.to_thread(service.files().list(
                        q=query,
                        spaces='drive',
                        fields="nextPageToken, files(id, name, mimeType, size)",
                        pageToken=page_token,
                        supportsAllDrives=True,
                        includeItemsFromAllDrives=True
                    ).execute)
                    
                    items = results.get('files', [])
                    print(f" - Found {len(items)} items in {folder_name}")
                    
                    for item in items:
                        if item['mimeType'] == 'application/vnd.google-apps.folder':
                            await _walk(item['id'], item['name'])
                        elif 'image/' in item['mimeType']:
                            all_files.append(item)
                    
                    page_token = results.get('nextPageToken')
                    if not page_token:
                        break
                except Exception as e:
                    print(f"Error scanning folder {current_folder_id}: {e}")
                    break
                    
        await _walk(folder_id)
        return all_files

drive_service = DriveService()
