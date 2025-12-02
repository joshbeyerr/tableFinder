# app/core/token_manager.py
import jwt
import time
from datetime import datetime, timedelta
from fastapi import HTTPException, status, Header
from typing import Optional
from app.core.config import settings

# Secret key for JWT signing (should be in .env in production)
JWT_SECRET_KEY = settings.JWT_SECRET_KEY
JWT_ALGORITHM = "HS256"
TOKEN_EXPIRY_HOURS = 24  # Tokens expire after 24 hours


def generate_session_token(task_id: str) -> str:
    """
    Generate a JWT token for a session.
    The token is encrypted and can only be decrypted by the server.
    """
    payload = {
        "task_id": task_id,
        "iat": datetime.utcnow(),  # Issued at
        "exp": datetime.utcnow() + timedelta(hours=TOKEN_EXPIRY_HOURS),  # Expiration
    }
    
    token = jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    return token


def validate_session_token(
    token: Optional[str] = Header(None, alias="x-session-token"),
    x_task_id: str = Header(..., alias="x-task-id")
) -> str:
    """
    Validate a session token and return the task_id.
    Raises HTTPException if token is invalid or missing.
    """
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing session token. Please start a booking session first.",
        )
    
    try:
        # Decode and verify the token
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        
        # Verify the task_id matches
        token_task_id = payload.get("task_id")
        if token_task_id != x_task_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token task_id mismatch.",
            )
        
        return token_task_id
        
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session token has expired. Please start a new session.",
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid session token.",
        )

