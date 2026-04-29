import json

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

    def build_episodes(self, turns: list[dict]) -> list[dict]:
        response = self.client.responses.create(
            model=self.model,
            instructions=(
                "You are aiLog's semantic episode builder. "
                "Read conversation turns and group turns that share the same user goal, topic, problem, or context. "
                "Do not group by connective words alone. Do not copy full conversation text into summaries. "
                "Return JSON only with this shape: "
                "{\"episodes\":[{\"title\":\"...\",\"summary\":\"...\",\"episode_type\":\"topic\","
                "\"emotion_signal\":null,\"importance_score\":0.0,\"keywords\":[\"...\"],"
                "\"rawlog_ids\":[\"...\"]}]}. "
                "Each rawlog_id must come from the provided turns. Preserve source rawlog_ids exactly."
            ),
            input=(
                "Build semantic episodes from these turns. "
                "A summary should describe the shared context in one concise sentence, not reproduce the dialog.\n\n"
                f"{json.dumps({'turns': turns}, ensure_ascii=False)}"
            ),
        )
        content = (response.output_text or "").strip()
        if not content:
            raise RuntimeError("OpenAI returned an empty episode build response")
        return self._parse_episode_json(content)

    def _parse_episode_json(self, content: str) -> list[dict]:
        try:
            data = json.loads(content)
        except json.JSONDecodeError:
            start = content.find("{")
            end = content.rfind("}")
            if start < 0 or end < start:
                raise RuntimeError("OpenAI did not return valid JSON") from None
            data = json.loads(content[start : end + 1])

        episodes = data.get("episodes")
        if not isinstance(episodes, list):
            raise RuntimeError("Episode build JSON must contain an episodes list")
        return [episode for episode in episodes if isinstance(episode, dict)]
