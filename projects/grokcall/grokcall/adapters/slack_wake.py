import httpx
import logging
from typing import Optional

from grokcall.core.ports import WakeNotifierPort

logger = logging.getLogger("grokcall.slack")


class SlackWakeNotifier(WakeNotifierPort):
    """Sends a single wake signal to a private Slack channel to wake the Grok Bot routine.

    Payload format strictly follows Section 9 of the spec:
    PHONE_CALL_STARTED
    call_id=01J...
    caller=+46701234567
    called=+46...
    """

    def __init__(self, webhook_url: Optional[str] = None):
        self.webhook_url = webhook_url

    async def notify_call_started(
        self,
        call_id: str,
        caller: str,
        called: str,
    ) -> bool:
        message = (
            f"PHONE_CALL_STARTED\n"
            f"call_id={call_id}\n"
            f"caller={caller}\n"
            f"called={called}"
        )

        if not self.webhook_url:
            logger.warning(f"No Slack webhook configured. Dry run wake notification:\n{message}")
            return True

        logger.info(f"Dispatching Slack wake notification for call {call_id}")
        payload = {
            "text": message
        }

        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                res = await client.post(self.webhook_url, json=payload)
                if res.status_code == 200:
                    return True
                else:
                    logger.error(f"Slack webhook failed with {res.status_code}: {res.text}")
                    return False
        except Exception as e:
            logger.error(f"Failed to post Slack wake notification: {e}")
            return False
