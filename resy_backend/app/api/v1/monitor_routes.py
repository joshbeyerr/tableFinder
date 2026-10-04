# app/api/v1/monitor_routes.py
import re
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field, field_validator

from app.core.config import settings
from app.core.security import get_api_key, rate_limiter
from app.services import monitor_store as ms
from app.services.monitor_service import compute_expiry

router = APIRouter(prefix="/monitors", tags=["monitors"])

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_HHMM_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


class MonitorCreate(BaseModel):
    venue_id: int
    venue_name: Optional[str] = Field(default=None, max_length=200)
    day: str                      # "YYYY-MM-DD"
    num_seats: int = Field(ge=1, le=20)
    time_start: Optional[str] = None   # "HH:MM" (24h)
    time_end: Optional[str] = None
    email: str = Field(max_length=254)
    interval_sec: int = 30

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        v = v.strip()
        if not _EMAIL_RE.match(v):
            raise ValueError("Invalid email address")
        return v

    @field_validator("day")
    @classmethod
    def _day(cls, v: str) -> str:
        try:
            parsed = datetime.strptime(v, "%Y-%m-%d").date()
        except ValueError:
            raise ValueError("day must be YYYY-MM-DD")
        if parsed < date.today():
            raise ValueError("day is in the past")
        return v

    @field_validator("time_start", "time_end")
    @classmethod
    def _hhmm(cls, v: Optional[str]) -> Optional[str]:
        if v in (None, ""):
            return None
        if not _HHMM_RE.match(v):
            raise ValueError("time must be HH:MM (24h)")
        return v


class MonitorOut(BaseModel):
    id: str
    venue_id: int
    venue_name: Optional[str]
    day: str
    num_seats: int
    time_start: Optional[str]
    time_end: Optional[str]
    email: str
    interval_sec: int
    status: str                    # active | notified | expired | cancelled
    created_at: float
    expires_at: float
    last_check_at: Optional[float]
    check_count: int
    last_error: Optional[str]
    found_slots: Optional[List[Dict[str, Any]]]
    notified_at: Optional[float]


def _mask_email(email: str) -> str:
    local, _, domain = email.partition("@")
    return f"{local[:2]}{'*' * max(len(local) - 2, 1)}@{domain}"


def _out(m: Dict[str, Any]) -> MonitorOut:
    fields = {k: m[k] for k in MonitorOut.model_fields if k in m}
    fields["email"] = _mask_email(m["email"])
    return MonitorOut(**fields)


# Ownership is the browser's x-task-id, a random id the client generates and
# keeps in localStorage. All routes also require the shared API key.

@router.post("", response_model=MonitorOut, dependencies=[Depends(rate_limiter)])
def create_monitor(body: MonitorCreate, x_task_id: str = Header(..., alias="x-task-id")):
    if not settings.RESEND_API_KEY:
        raise HTTPException(status_code=503, detail="Email notifications are not configured on the server.")

    interval = max(body.interval_sec, settings.MONITOR_MIN_INTERVAL_SEC)
    try:
        monitor = ms.store.create(
            x_task_id,
            venue_id=body.venue_id,
            venue_name=body.venue_name,
            day=body.day,
            num_seats=body.num_seats,
            time_start=body.time_start,
            time_end=body.time_end,
            email=body.email,
            interval_sec=interval,
            expires_at=compute_expiry(body.day),
        )
    except ms.LimitReached as e:
        raise HTTPException(status_code=429, detail=str(e))
    return _out(monitor)


@router.get("", response_model=List[MonitorOut], dependencies=[Depends(get_api_key)])
def list_monitors(x_task_id: str = Header(..., alias="x-task-id")):
    return [_out(m) for m in ms.store.list_for_owner(x_task_id)]


@router.delete("/{monitor_id}", response_model=MonitorOut, dependencies=[Depends(get_api_key)])
def cancel_monitor(monitor_id: str, x_task_id: str = Header(..., alias="x-task-id")):
    monitor = ms.store.get(monitor_id, x_task_id)
    if not monitor:
        raise HTTPException(status_code=404, detail="Monitor not found")
    ms.store.set_status(monitor_id, ms.CANCELLED, owner_id=x_task_id)
    return _out(ms.store.get(monitor_id, x_task_id))
