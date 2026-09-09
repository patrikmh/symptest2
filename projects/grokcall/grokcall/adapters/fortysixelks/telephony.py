import json
import base64
import logging
from typing import Optional, Dict, Any
from fastapi import WebSocket, WebSocketDisconnect

from grokcall.core.ports import TelephonyLeg

logger = logging.getLogger("grokcall.fortysixelks")


class FortySixElksActionBuilder:
    """Helper to construct 46elks call action JSON structures."""

    @staticmethod
    def play_and_connect(play_url: str, connect_to: str) -> Dict[str, Any]:
        """Play connecting audio while routing to realtime voice number."""
        return {
            "play": play_url,
            "next": {
                "connect": connect_to
            }
        }

    @staticmethod
    def connect_realtime(connect_to: str) -> Dict[str, Any]:
        return {
            "connect": connect_to
        }

    @staticmethod
    def hangup(reason: str = "busy") -> Dict[str, Any]:
        return {
            "hangup": reason
        }


class FortySixElksWebSocketLeg(TelephonyLeg):
    """46elks Realtime Voice WebSocket adapter.

    Negotiates:
    - listening: ulaw (we receive ulaw from caller)
    - sending: ulaw (we send ulaw to caller)
    Sends:
    - 'audio' messages with base64 data
    - 'interrupt' to flush buffered audio
    - 'bye' to hang up cleanly
    """

    def __init__(self, websocket: WebSocket, callid: str, caller: str, called: str):
        self.websocket = websocket
        self.callid = callid
        self.caller = caller
        self.called = called
        self._is_open = True
        self._ignoring_audio_state = False

    async def setup_audio_session(self) -> None:
        """Send format negotiation messages required after hello."""
        await self.websocket.send_text(json.dumps({
            "t": "listening",
            "format": "ulaw"
        }))
        await self.websocket.send_text(json.dumps({
            "t": "sending",
            "format": "ulaw"
        }))
        self._ignoring_audio_state = False

    async def send_audio_chunk(self, chunk: bytes) -> None:
        if not self._is_open:
            return

        # If 46elks is in interrupt state, re-establish sending mode
        if self._ignoring_audio_state:
            await self.websocket.send_text(json.dumps({
                "t": "sending",
                "format": "ulaw"
            }))
            self._ignoring_audio_state = False

        b64_data = base64.b64encode(chunk).decode("ascii")
        await self.websocket.send_text(json.dumps({
            "t": "audio",
            "data": b64_data
        }))

    async def interrupt(self) -> None:
        """Tell 46elks to immediately clear its audio buffer and ignore audio."""
        if not self._is_open:
            return
        logger.info(f"Sending 46elks interrupt for call {self.callid}")
        await self.websocket.send_text(json.dumps({
            "t": "interrupt"
        }))
        self._ignoring_audio_state = True

    async def hangup(self) -> None:
        if not self._is_open:
            return
        logger.info(f"Sending 46elks bye for call {self.callid}")
        try:
            await self.websocket.send_text(json.dumps({
                "t": "bye"
            }))
        except Exception as e:
            logger.warning(f"Error sending bye: {e}")
        finally:
            self._is_open = False
