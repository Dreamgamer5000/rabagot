from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    GOOGLE_CREDENTIALS_FILE: str = "credentials.json"


    FACE_SIMILARITY_THRESHOLD: float = 0.6
    SYNC_CONCURRENCY: int = 4  # Number of photos to process in parallel during Drive sync (1-2 for low-end VPS, 4-8 for standard, 10+ for high-perf)

    ADMIN_PASSWORD: str = "admin123"  # Default, should be changed in .env
    SECRET_KEY: str = "ThisIsMyLongSecretKeyForJWT"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours

    DB_PATH: str = "data/app.db"
    SERVICE_ACCOUNTS_DIR: str = "data/accounts"
    UPLOAD_ROOT: str = "data/uploads/originals"
    THUMBNAIL_ROOT: str = "data/thumbnails"
    PREVIEWS_ROOT: str = "data/previews"
    FACE_MODEL_ROOT: str = "data/insightface"
    GUEST_SELFIES_DIR: str = "data/uploads/selfies"
    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache()
def get_settings():
    return Settings()
