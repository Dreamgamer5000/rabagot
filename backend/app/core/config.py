from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    GOOGLE_CREDENTIALS_FILE: str = "credentials.json"
    SERVICE_ACCOUNTS_DIR: str = r"C:\Users\yash\Documents\Projects\MLTBBotFiles\Bot credentials\accounts"
    DRIVE_FOLDER_ID: str = "" # Root folder ID from .env
    
    FACE_SIMILARITY_THRESHOLD: float = 0.6
    
    ADMIN_PASSWORD: str = "admin123" # Default, should be changed in .env
    SECRET_KEY: str = "ThisIsMyLongSecretKeyForJWT"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 # 24 hours
    ALLOWED_ORIGINS: str = "http://localhost:3000,http://localhost:3005,http://192.168.1.34:3005" # Comma separated
    
    class Config:
        env_file = ".env"
        extra = "ignore"

@lru_cache()
def get_settings():
    return Settings()
