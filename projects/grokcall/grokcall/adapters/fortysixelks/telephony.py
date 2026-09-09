import base64
import json
import logging
from dataclasses import dataclass
from typing import Any, Dict, Mapping, Optional, Protocol

from grokcall.core.ports import TelephonyLeg

logger = logging.getLogger("grokcall.fortysixelks")


@dataclass(frozen=True)
class IncomingCall:
    callid: str
    caller: str
    called: str
    direction: str = "incoming"


def parse_incoming_form(form: Mapping[str, str]) -> IncomingCall:
    """Parse the ``voice_start`` webhook body (application/x-www-form-urlencoded)."""
    return IncomingCall(
        callid=form.get("callid") or form.get("id") or "",
        caller=form.get("from", ""),
        called=form.get("to", ""),
        direction=form.get("direction", "incoming"),
    )


def parse_hangup_form(form: Mapping[str, str]) -> Optional[str]:
    """The ``whenhangup`` callback identifies the call as ``id``; older payloads use
    ``callid``. Returns the provider call id if present."""
    return form.get("id") or form.get("callid") or None


class FortySixElksActionBuilder:
    """Builds the JSON call-action objects 46elks expects as webhook responses."""

    @staticmethod
    def play_then_connect(play_url: str, connect_to: str) -> Dict[str, Any]:
        return {"play": play_url, "next": {"connect": connect_to}}

    @staticmethod
    def connect(connect_to: str) -> Dict[str, Any]:
        return {"connect": connect_to}

    @staticmethod
    def hangup(reason: str = "busy") -> Dict[str, Any]:
        return {"hangup": reason}


class JsonSocket(Protocol):
    """The subset of a WebSocket the realtime leg needs; lets tests use a fake."""

    async def send_text(self, data: str) -> None: ...


class FortySixElksWebSocketLeg(TelephonyLeg):
    """Outbound half of the 46elks Realtime Voice protocol.

    Message flow (all JSON, type in ``t``):
      API -> app   hello {callid, from, to}
      app -> API   listening {format}   we want caller audio in this format
      app -> API   sending {format}     we will send audio in this format
      both         audio {data: base64}
      app -> API   interrupt           drop buffered audio and ignore further audio
                                       until a new ``sending`` message
      app -> API   bye                 hang up after buffered audio has played
      API -> app   bye {reason, message}  always the last message; wait for it
    """

    FORMAT = "ulaw"

    def __init__(self, socket: JsonSocket, callid: str, caller: str, called: str):
        self.socket = socket
        self.callid = callid
        self.caller = caller
        self.called = called
        self.open = True
        self.bye_sent = False
        self._sending_armed = False

    async def setup_audio_session(self) -> None:
        await self._send({"t": "listening", "format": self.FORMAT})
        await self._arm_sending()

    async def _arm_sending(self) -> None:
        await self._send({"t": "sending", "format": self.FORMAT})
        self._sending_armed = True

    async def send_audio_chunk(self, chunk: bytes) -> None:
        if not self.open or self.bye_sent:
            return
        if not self._sending_armed:
            await self._arm_sending()
        await self._send({"t": "audio", "data": base64.b64encode(chunk).decode("ascii")})

    async def interrupt(self) -> None:
        if not self.open or self.bye_sent:
            return
        logger.info("Interrupting playback on %s", self.callid)
        await self._send({"t": "interrupt"})
        self._sending_armed = False

    async def hangup(self) -> None:
        """Ask 46elks to end the call once buffered audio has played. The socket
        stays open until the API's final ``bye`` arrives."""
        if not self.open or self.bye_sent:
            return
        self.bye_sent = True
        logger.info("Sending bye on %s", self.callid)
        await self._send({"t": "bye"})

    def mark_closed(self) -> None:
        self.open = False

    async def _send(self, message: Dict[str, Any]) -> None:
        try:
            await self.socket.send_text(json.dumps(message))
        except Exception as exc:  # noqa: BLE001 - socket may be gone mid-call
            logger.warning("Realtime socket send failed on %s: %s", self.callid, exc)
            self.open = False
