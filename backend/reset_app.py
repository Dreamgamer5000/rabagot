import asyncio
import os
import shutil
from app.core.config import get_settings

async def reset_database():
    db_path = "app.db"
    print(f"Cleaning database: {db_path}")
    if os.path.exists(db_path):
        os.remove(db_path)
        print(" - Deleted app.db")
    else:
        print(" - app.db not found, skipping.")

def clear_folders():
    folders = [
        "thumbnails",
        "uploads/originals",
        "uploads/selfies"
    ]
    
    print("Cleaning local files...")
    for folder in folders:
        if os.path.exists(folder):
            for filename in os.listdir(folder):
                file_path = os.path.join(folder, filename)
                try:
                    if os.path.isfile(file_path) or os.path.islink(file_path):
                        os.unlink(file_path)
                    elif os.path.isdir(file_path):
                        shutil.rmtree(file_path)
                except Exception as e:
                    print(f'Failed to delete {file_path}. Reason: {e}')
            print(f" - Cleared {folder}")
        else:
            print(f" - Folder {folder} does not exist, skipping.")

async def main():
    print("Starting full application reset...")
    await reset_database()
    clear_folders()
    print("Done! Application has been reset to a clean state.")

if __name__ == "__main__":
    asyncio.run(main())
