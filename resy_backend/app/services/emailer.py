# app/services/emailer.py
import html
from typing import Any, Dict, List

import requests

from app.core.config import settings


class EmailError(Exception):
    pass


def send_email(to: str, subject: str, html_body: str, text_body: str) -> None:
    if not settings.RESEND_API_KEY:
        raise EmailError("RESEND_API_KEY is not configured on the server")

    resp = requests.post(
        "https://api.resend.com/emails",
        headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}"},
        json={
            "from": settings.EMAIL_FROM,
            "to": [to],
            "subject": subject,
            "html": html_body,
            "text": text_body,
        },
        timeout=15,
    )
    if resp.status_code >= 400:
        raise EmailError(f"Resend error {resp.status_code}: {resp.text[:300]}")


def _fmt_slot(slot: Dict[str, Any]) -> str:
    start = slot.get("start") or ""
    # "2025-09-02 19:30:00" -> "19:30"
    t = start.split(" ")[-1][:5] if start else "?"
    kind = slot.get("type") or "Table"
    return f"{t} ({kind})"


def send_slot_alert(monitor: Dict[str, Any], slots: List[Dict[str, Any]]) -> None:
    venue = monitor.get("venue_name") or f"venue {monitor['venue_id']}"
    times = [_fmt_slot(s) for s in slots[:10]]
    subject = f"Table open at {venue} on {monitor['day']}"

    text = (
        f"A table opened up at {venue} on {monitor['day']} for {monitor['num_seats']}.\n\n"
        f"Available times: {', '.join(times)}\n\n"
        "Book quickly on Resy, these go fast: https://resy.com\n"
    )
    items = "".join(f"<li>{html.escape(t)}</li>" for t in times)
    body = (
        f"<p>A table opened up at <strong>{html.escape(venue)}</strong> on "
        f"<strong>{html.escape(monitor['day'])}</strong> for {monitor['num_seats']}.</p>"
        f"<ul>{items}</ul>"
        '<p><a href="https://resy.com">Book on Resy</a>. These go fast.</p>'
    )
    send_email(monitor["email"], subject, body, text)
