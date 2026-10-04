# app/services/monitor_service.py
import logging
import time
from datetime import datetime, timedelta
from typing import Any, Dict

from app.core.config import settings
from app.services import monitor_store as ms
from app.services.emailer import send_slot_alert
from app.services.resy_client import ResyClient, ResyClientError
from app.services.slots import filter_slots_by_time, parse_slots

log = logging.getLogger("monitor")

_resy = ResyClient(
    api_key=settings.RESY_API_KEY,
    user_agent=settings.USER_AGENT,
    request_timeout=settings.REQUEST_TIMEOUT,
)


def compute_expiry(day: str) -> float:
    """Monitors stop at the end of the reservation day, or after MONITOR_MAX_AGE_HOURS."""
    cap = time.time() + settings.MONITOR_MAX_AGE_HOURS * 3600
    try:
        end_of_day = datetime.strptime(day, "%Y-%m-%d") + timedelta(days=1)
        return min(cap, end_of_day.timestamp())
    except ValueError:
        return cap


def _check(monitor: Dict[str, Any]) -> None:
    interval = monitor["interval_sec"]
    try:
        resp = _resy.find(
            venue_id=str(monitor["venue_id"]),
            num_seats=monitor["num_seats"],
            day=monitor["day"],
        )
        slots = filter_slots_by_time(
            parse_slots(resp), monitor["time_start"], monitor["time_end"]
        )
    except ResyClientError as e:
        ms.store.record_check(monitor["id"], interval, error=f"Resy: {e.message}")
        return
    except Exception as e:  # keep one bad monitor from killing the tick
        log.exception("monitor %s check failed", monitor["id"])
        ms.store.record_check(monitor["id"], interval, error=str(e))
        return

    if not slots:
        ms.store.record_check(monitor["id"], interval)
        return

    try:
        send_slot_alert(monitor, slots)
    except Exception as e:
        # Slot is open but the email failed: stay active and retry next check.
        log.error("monitor %s email failed: %s", monitor["id"], e)
        ms.store.record_check(monitor["id"], interval, error=f"Email failed: {e}")
        return

    ms.store.mark_notified(monitor["id"], slots)
    log.info("monitor %s notified (%d slots)", monitor["id"], len(slots))


def run_due_monitors() -> None:
    """Scheduler entrypoint: check every active monitor that is due."""
    now = time.time()
    for monitor in ms.store.due():
        if monitor["expires_at"] <= now:
            ms.store.set_status(monitor["id"], ms.EXPIRED)
            continue
        _check(monitor)


def cleanup_finished() -> None:
    ms.store.delete_old(older_than_sec=7 * 24 * 3600)
