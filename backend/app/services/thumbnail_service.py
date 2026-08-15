from PIL import Image, ImageOps
import os

class ThumbnailService:
    @staticmethod
    def generate_thumbnail(image_path: str, output_path: str, size=(512, 512)):
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with Image.open(image_path) as img:
            # Correct EXIF orientation if present
            try:
                img = ImageOps.exif_transpose(img)
            except Exception:
                pass

            # Handle PNG / WebP alpha channels (RGBA, LA, P) and CMYK to avoid JPEG save crash
            if img.mode in ("RGBA", "LA", "P", "PA", "CMYK"):
                if img.mode in ("RGBA", "LA", "PA"):
                    # Create solid white background for transparent pixels
                    background = Image.new("RGB", img.size, (255, 255, 255))
                    try:
                        # Extract alpha mask
                        alpha = img.convert("RGBA").split()[3]
                        background.paste(img.convert("RGB"), mask=alpha)
                        img = background
                    except Exception:
                        img = img.convert("RGB")
                else:
                    img = img.convert("RGB")
            elif img.mode != "RGB":
                img = img.convert("RGB")

            img.thumbnail(size, Image.Resampling.LANCZOS)
            img.save(output_path, "JPEG", quality=85, optimize=True)

    @staticmethod
    def generate_preview(image_path: str, output_path: str, max_dim: int = 2048, quality: int = 82):
        """Generates a 2K WebP screen preview (~250-350KB) for instant <50ms fullscreen viewing"""
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with Image.open(image_path) as img:
            try:
                img = ImageOps.exif_transpose(img)
            except Exception:
                pass

            if img.mode not in ("RGB", "RGBA"):
                img = img.convert("RGB")

            img.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)
            img.save(output_path, "WEBP", quality=quality, method=4)

thumbnail_service = ThumbnailService()
