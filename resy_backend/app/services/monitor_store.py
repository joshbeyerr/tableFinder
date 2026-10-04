# app/services/monitor_store.py
import json
import os
import sqlite3
import threading
import time
import uuid
from contextlib import contextmanager
from typing import Any, Dict, List, Optional

from app.core.config import settings

ACTIVE = "active"
NOTIFIED = "notified"
EXPIRED = "expired"
CANCELLED = "cancelled"

_SCHEMA = """
CREATE TABLE IF NOT EXISTS monitors (
    id            TEXT PRIMARY KEY,
    owner_id      TEXT NOT NULL,
    venue_id      INTEGER NOT NULL,
    venue_name    TEXT,
    day           TEXT NOT NULL,
    num_seats     INTEGER NOT NULL,
    time_start    TEXT,
    time_end      TEXT,
    email         TEXT NOT NULL,
    interval_sec  INTEGER NOT NULL,
    status        TEXT NOT NULL,
    created_at    REAL NOT NULL,
    expires_at    REAL NOT NULL,
    next_check_at REAL NOT NULL,
    last_check_at REAL,
    check_count   INTEGER NOT NULL DEFAULT 0,
    last_error    TEXT,
    found_slots   TEXT,
    notified_at   REAL
);
CREATE INDEX IF NOT EXISTS idx_monitors_owner ON monitors(owner_id);
CREATE INDEX IF NOT EXISTS idx_monitors_due ON monitors(status, next_check_at);
"""


class LimitReached(Exception):
    pass


class MonitorStore:
    def __init__(self, path: str):
        self.path = path
        self._lock = threading.Lock()
        parent = os.path.dirname(path)
        if parent:
            os.makedirs(parent, exist_ok=True)
        with self._conn() as conn:
            conn.executescript(_SCHEMA)

    @contextmanager
    def _conn(self):
        conn = sqlite3.connect(self.path, timeout=10)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    @staticmethod
    def _row(row: Optional[sqlite3.Row]) -> Optional[Dict[str, Any]]:
        if row is None:
            return None
        d = dict(row)
        d["found_slots"] = json.loads(d["found_slots"]) if d["found_slots"] else None
        return d

    def create(self, owner_id: str, **fields) -> Dict[str, Any]:
        now = time.time()
        monitor_id = uuid.uuid4().hex
        with self._lock, self._conn() as conn:
            active = conn.execute(
                "SELECT COUNT(*) FROM monitors WHERE owner_id=? AND status=?",
                (owner_id, ACTIVE),
            ).fetchone()[0]
            if active >= settings.MONITOR_MAX_ACTIVE_PER_OWNER:
                raise LimitReached(
                    f"You can have at most {settings.MONITOR_MAX_ACTIVE_PER_OWNER} active monitors."
                )
            conn.execute(
                """INSERT INTO monitors
                   (id, owner_id, venue_id, venue_name, day, num_seats, time_start, time_end,
                    email, interval_sec, status, created_at, expires_at, next_check_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    monitor_id, owner_id, fields["venue_id"], fields.get("venue_name"),
                    fields["day"], fields["num_seats"], fields.get("time_start"),
                    fields.get("time_end"), fields["email"], fields["interval_sec"],
                    ACTIVE, now, fields["expires_at"], now,
                ),
            )
        return self.get(monitor_id, owner_id)

    def get(self, monitor_id: str, owner_id: str) -> Optional[Dict[str, Any]]:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT * FROM monitors WHERE id=? AND owner_id=?", (monitor_id, owner_id)
            ).fetchone()
        return self._row(row)

    def list_for_owner(self, owner_id: str) -> List[Dict[str, Any]]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM monitors WHERE owner_id=? ORDER BY created_at DESC", (owner_id,)
            ).fetchall()
        return [self._row(r) for r in rows]

    def due(self, limit: int = 50) -> List[Dict[str, Any]]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM monitors WHERE status=? AND next_check_at<=? "
                "ORDER BY next_check_at LIMIT ?",
                (ACTIVE, time.time(), limit),
            ).fetchall()
        return [self._row(r) for r in rows]

    def record_check(self, monitor_id: str, interval_sec: int, error: Optional[str] = None):
        now = time.time()
        with self._lock, self._conn() as conn:
            conn.execute(
                "UPDATE monitors SET last_check_at=?, next_check_at=?, "
                "check_count=check_count+1, last_error=? WHERE id=? AND status=?",
                (now, now + interval_sec, error, monitor_id, ACTIVE),
            )

    def mark_notified(self, monitor_id: str, slots: List[Dict[str, Any]]):
        now = time.time()
        with self._lock, self._conn() as conn:
            conn.execute(
                "UPDATE monitors SET status=?, notified_at=?, found_slots=?, last_check_at=?, "
                "check_count=check_count+1, last_error=NULL WHERE id=?",
                (NOTIFIED, now, json.dumps(slots), now, monitor_id),
            )

    def set_status(self, monitor_id: str, status: str, owner_id: Optional[str] = None) -> bool:
        """Move an ACTIVE monitor to a terminal status. Returns False if it wasn't active."""
        sql = "UPDATE monitors SET status=? WHERE id=? AND status=?"
        args: list = [status, monitor_id, ACTIVE]
        if owner_id is not None:
            sql += " AND owner_id=?"
            args.append(owner_id)
        with self._lock, self._conn() as conn:
            return conn.execute(sql, args).rowcount > 0

    def delete_old(self, older_than_sec: float):
        cutoff = time.time() - older_than_sec
        with self._lock, self._conn() as conn:
            conn.execute(
                "DELETE FROM monitors WHERE status!=? AND created_at<?", (ACTIVE, cutoff)
            )


store = MonitorStore(settings.DB_PATH)
