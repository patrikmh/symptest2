import pytest
import os
import tempfile
from grokcall.persistence.database import Database
from grokcall.core.registry import CallSession
from grokcall.core.models import CallStatus
from datetime import datetime, timezone


def test_sqlite_persistence():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name

    try:
        db = Database(db_path)
        session = CallSession("call_db_1", "+46701234567", "+46766860000", provider_call_id="c_prov_1")
        session.status = CallStatus.ENDED
        session.ended_at = datetime.now(timezone.utc)
        session.summary = "Caller wanted to discuss project"

        # Add turn and message synchronously for test
        import asyncio
        asyncio.run(session.add_caller_turn("Kan Patrik ringa mig imorgon?"))
        asyncio.run(session.add_assistant_turn("Absolut, jag ber honom ringa dig.", "sv"))
        asyncio.run(session.add_message("Johan", "Please call tomorrow", True, "normal"))

        db.save_session(session)

        # Retrieve and verify
        record = db.get_call("call_db_1")
        assert record is not None
        assert record["caller_number"] == "+46701234567"
        assert record["status"] == "ended"
        assert record["summary"] == "Caller wanted to discuss project"
        assert len(record["turns"]) == 2
        assert len(record["messages"]) == 1
        assert record["messages"][0]["caller_name"] == "Johan"
        assert record["messages"][0]["callback_requested"] == 1

        recent = db.list_recent_calls()
        assert len(recent) == 1
    finally:
        if os.path.exists(db_path):
            os.remove(db_path)
