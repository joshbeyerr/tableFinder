# app/core/config.py
from pydantic_settings import BaseSettings
from pydantic import ConfigDict
from pathlib import Path

class Settings(BaseSettings):
    model_config = ConfigDict(
        env_file=str(Path(__file__).parent.parent.parent / ".env")
    )

    RESY_API_KEY: str
    MODE: str  # "development" or "production"
    
    USER_AGENT: str = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/137.0.0.0 Safari/537.36 Edg/137.0.0.0"
    )
    REQUEST_TIMEOUT: float = 12.0

    # For your own API
    API_KEY: str = "super-secret-dev-key"  # override in .env
    RATE_LIMIT_REQUESTS: int = 30          # per window
    RATE_LIMIT_WINDOW_SEC: int = 60
    
    # JWT token secret (should be a long random string in production)
    JWT_SECRET_KEY: str = "your-super-secret-jwt-key-change-in-production"

settings = Settings()
