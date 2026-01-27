from PIL import Image
import os

class ThumbnailService:
    @staticmethod
    def generate_thumbnail(image_path: str, output_path: str, size=(512, 512)):
        with Image.open(image_path) as img:
            img.thumbnail(size)
            img.save(output_path, "JPEG", quality=85)

thumbnail_service = ThumbnailService()
