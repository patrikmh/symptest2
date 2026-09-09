import sqlite3
import json
import logging
from typing import Optional, List, Dict, Any
from grokcall.core.registry import CallSession

logger = logging.getLogger("grokcall.db")


class Database:
    """SQLite database for persisting calls, turns, messages, and latency metrics."""

    def __init__(self, db_path: str = "grokcall.db"):
        self.db_path = db_path
        self._init_tables()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_tables(self) -> None:
        with self._get_connection() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS calls (
                    id TEXT PRIMARY KEY,
                    provider_call_id TEXT,
                    caller_number TEXT NOT NULL,
                    called_number TEXT NOT NULL,
                    started_at TEXT NOT NULL,
                    ended_at TEXT,
                    status TEXT NOT NULL,
                    language TEXT,
                    summary TEXT,
                    handled_by TEXT,
                    end_reason TEXT,
                    timings_json TEXT,
                    latencies_json TEXT
                )
            """)

            conn.execute("""
                CREATE TABLE IF NOT EXISTS call_turns (
                    id TEXT PRIMARY KEY,
                    call_id TEXT NOT NULL,
                    turn_number INTEGER NOT NULL,
                    speaker TEXT NOT NULL,
                    text TEXT NOT NULL,
                    language TEXT,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (call_id) REFERENCES calls (id) ON DELETE CASCADE
                )
            """)

            conn.execute("""
                CREATE TABLE IF NOT EXISTS call_messages (
                    id TEXT PRIMARY KEY,
                    call_id TEXT NOT NULL,
                    caller_name TEXT,
                    message TEXT NOT NULL,
                    callback_requested INTEGER NOT NULL,
                    urgency TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (call_id) REFERENCES calls (id) ON DELETE CASCADE
                )
            """)
            conn.commit()

    def save_session(self, session: CallSession) -> None:
        latencies = session.timings.compute_latencies()
        with self._get_connection() as conn:
            conn.execute("""
                INSERT OR REPLACE INTO calls (
                    id, provider_call_id, caller_number, called_number,
                    started_at, ended_at, status, language, summary,
                    handled_by, end_reason, timings_json, latencies_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                session.call_id,
                session.provider_call_id,
                session.caller,
                session.called,
                session.started_at.isoformat(),
                session.ended_at.isoformat() if session.ended_at else None,
                session.status.value,
                session.detected_language,
                session.summary,
                session.handled_by,
                session.end_reason,
                json.dumps(session.timings.model_dump(mode="json")),
                json.dumps(latencies),
            ))

            for turn in session.turns:
                conn.execute("""
                    INSERT OR REPLACE INTO call_turns (
                        id, call_id, turn_number, speaker, text, language, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (
                    turn.id,
                    session.call_id,
                    turn.turn_number,
                    turn.speaker.value,
                    turn.text,
                    turn.language,
                    turn.created_at.isoformat(),
                ))

            for msg in session.messages:
                conn.execute("""
                    INSERT OR REPLACE INTO call_messages (
                        id, call_id, caller_name, message, callback_requested, urgency, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (
                    msg.id,
                    session.call_id,
                    msg.caller_name,
                    msg.message,
                    1 if msg.callback_requested else 0,
                    msg.urgency,
                    msg.created_at.isoformat(),
                ))

            conn.commit()

    def get_call(self, call_id: str) -> Optional[Dict[str, Any]]:
        with self._get_connection() as conn:
            cur = conn.execute("SELECT * FROM calls WHERE id = ?", (call_id,))
            call_row = cur.fetchone()
            if not call_row:
                return None

            cur = conn.execute("SELECT * FROM call_turns WHERE call_id = ? ORDER BY turn_number", (call_id,))
            turns = [dict(r) for r in cur.fetchall()]

            cur = conn.execute("SELECT * FROM call_messages WHERE call_id = ? ORDER BY created_at", (call_id,))
            messages = [dict(r) for r in cur.fetchall()]

            data = dict(call_row)
            data["turns"] = turns
            data["messages"] = messages
            data["latencies"] = json.loads(data["latencies_json"]) if data.get("latencies_json") else {}
            data["timings"] = json.loads(data["timings_json"]) if data.get("timings_json") else {}
            return data

    def list_recent_calls(self, limit: int = 50) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cur = conn.execute("SELECT * FROM calls ORDER BY started_at DESC LIMIT ?", (limit,))
            return [dict(r) for r in cur.fetchall()]
