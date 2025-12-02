# app/core/security.py
import time
from fastapi import HTTPException, status, Depends, Request
from app.core.config import settings

# In-memory rate limit store: {identifier: [timestamps]}
_request_log: dict[str, list[float]] = {}


def get_api_key(request: Request) -> str:
    """
    Very simple API key auth.
    React will send:  x-api-key: <your-key>  in headers.
    """
    api_key = request.headers.get("x-api-key")

    # dev test
    api_key = "super-secret-dev-key"

    if not api_key or api_key != settings.API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key.",
        )
    return api_key



def rate_limiter(
    request: Request,
    api_key: str = Depends(get_api_key),  # ensures auth happens first
):
    """
    Naive per-API-key rate limiting in memory.
    Good enough for your own project; upgrade later to Redis.
    """
    identifier = api_key  # you could also mix in client IP if you want
    now = time.time()

    max_requests = settings.RATE_LIMIT_REQUESTS
    window = settings.RATE_LIMIT_WINDOW_SEC

    history = _request_log.setdefault(identifier, [])

    # keep only timestamps within the last `window` seconds
    cutoff = now - window
    history = [t for t in history if t > cutoff]
    _request_log[identifier] = history

    if len(history) >= max_requests:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit exceeded, try again in a bit.",
        )

    history.append(now)
