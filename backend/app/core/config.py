from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    GOOGLE_CREDENTIALS_FILE: str = "credentials.json"


    FACE_SIMILARITY_THRESHOLD: float = 0.6

    ADMIN_PASSWORD: str = "admin123"  # Default, should be changed in .env
    SECRET_KEY: str = "ThisIsMyLongSecretKeyForJWT"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours

    DB_PATH: str = "data/app.db"
    SERVICE_ACCOUNTS_DIR: str = "data/accounts"
    UPLOAD_ROOT: str = "data/uploads/originals"
    THUMBNAIL_ROOT: str = "data/thumbnails"
    FACE_MODEL_ROOT: str = "data/insightface"
    GUEST_SELFIES_DIR: str = "data/uploads/selfies"
    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache()
def get_settings():
    return Settings()
