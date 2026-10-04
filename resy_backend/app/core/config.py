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
    
    # CORS origins (comma-separated list, or "*" for all)
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173,http://127.0.0.1:5173"

    # Venue search geo override (useful when server-side geo/IP is wrong)
    # Example (Toronto): VENUESEARCH_OVERRIDE_LATITUDE=43.6532, VENUESEARCH_OVERRIDE_LONGITUDE=-79.3832
    VENUESEARCH_OVERRIDE_LATITUDE: float | None = None
    VENUESEARCH_OVERRIDE_LONGITUDE: float | None = None

    # Persistent storage for monitor jobs. On Railway, mount a volume at /data
    # and set DB_PATH=/data/monitors.db so jobs survive redeploys.
    DB_PATH: str = "data/monitors.db"

    # Email (Resend, https://resend.com). Without a verified domain Resend only
    # delivers to the account owner's address; set EMAIL_FROM to an address on
    # your verified domain to email anyone.
    RESEND_API_KEY: str | None = None
    EMAIL_FROM: str = "Table Finder <onboarding@resend.dev>"

    # Monitor limits
    MONITOR_TICK_SEC: int = 5               # how often the scheduler looks for due monitors
    MONITOR_MIN_INTERVAL_SEC: int = 15      # floor on per-monitor check interval
    MONITOR_MAX_ACTIVE_PER_OWNER: int = 3
    MONITOR_MAX_AGE_HOURS: int = 72

settings = Settings()
