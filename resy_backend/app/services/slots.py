# app/services/slots.py
import re
from datetime import datetime, time
from typing import Any, Dict, List, Optional


def parse_slots(find_response: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Flatten a Resy /4/find response into a list of simple slot dicts."""
    venues = find_response.get("results", {}).get("venues", [])
    if not venues:
        return []

    out: List[Dict[str, Any]] = []
    for s in venues[0].get("slots", []):
        cfg = s.get("config", {})
        date = s.get("date", {})
        payment = s.get("payment", {})
        out.append(
            {
                "token": cfg.get("token"),
                "type": cfg.get("type"),
                "start": date.get("start"),
                "end": date.get("end"),
                "is_paid": bool(payment.get("is_paid")),
            }
        )
    return out


def _parse_hhmm(v: Optional[str]) -> Optional[time]:
    if not v:
        return None
    try:
        hh, mm = v.split(":")
        return time(hour=int(hh), minute=int(mm))
    except Exception:
        return None


def _extract_slot_time(slot_start: Optional[str]) -> Optional[time]:
    if not slot_start:
        return None
    # Try ISO first (handle trailing Z)
    try:
        dt = datetime.fromisoformat(slot_start.replace("Z", "+00:00"))
        return dt.timetz().replace(tzinfo=None)
    except Exception:
        pass
    # Fallback: grab HH:MM anywhere in string
    m = re.search(r"(\d{2}):(\d{2})", slot_start)
    if not m:
        return None
    return time(hour=int(m.group(1)), minute=int(m.group(2)))


def filter_slots_by_time(
    slots: List[Dict[str, Any]],
    time_start: Optional[str],
    time_end: Optional[str],
) -> List[Dict[str, Any]]:
    """Keep slots whose time-of-day falls in [time_start, time_end] (HH:MM, 24h)."""
    start_t = _parse_hhmm(time_start)
    end_t = _parse_hhmm(time_end)
    if not start_t and not end_t:
        return slots

    filtered = []
    for slot in slots:
        slot_t = _extract_slot_time(slot.get("start"))
        if slot_t is None:
            continue
        if start_t and not end_t:
            ok = slot_t >= start_t
        elif end_t and not start_t:
            ok = slot_t <= end_t
        elif start_t <= end_t:
            ok = start_t <= slot_t <= end_t
        else:  # window crosses midnight (e.g. 22:00 -> 02:00)
            ok = slot_t >= start_t or slot_t <= end_t
        if ok:
            filtered.append(slot)
    return filtered
