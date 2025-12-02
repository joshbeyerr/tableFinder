# app/services/__init__.py
from app.services.resy_client import ResyClient
from app.core.config import settings

resy_client = ResyClient(
    api_key=settings.RESY_API_KEY,
    user_agent=settings.USER_AGENT,
    request_timeout=settings.REQUEST_TIMEOUT,
)
