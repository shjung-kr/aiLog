from openai import OpenAI

from app.core.config import settings
from app.db.models.rawlog import RawLog


SYSTEM_PROMPT = (
    "You are aiLog's chat assistant. Give a direct, useful reply to the user's latest message. "
    "Preserve important context from the prior conversation when relevant. "
    "Do not mention internal storage or raw logs unless the user asks about them."
)


class LLMClient:
    def __init__(self) -> None:
        if not settings.openai_api_key:
            raise RuntimeError("OPENAI_API_KEY is not configured")
        self.client = OpenAI(api_key=settings.openai_api_key)
        self.model = settings.openai_model

    def generate_reply(self, rawlogs: list[RawLog]) -> tuple[str, str]:
        response = self.client.responses.create(
            model=self.model,
            instructions=SYSTEM_PROMPT,
            input=[
                {
                    "role": rawlog.speaker_type,
                    "content": rawlog.content,
                }
                for rawlog in rawlogs
                if rawlog.speaker_type in {"user", "assistant", "system"}
            ],
        )
        content = (response.output_text or "").strip()
        if not content:
            raise RuntimeError("OpenAI returned an empty response")
        return content, self.model
