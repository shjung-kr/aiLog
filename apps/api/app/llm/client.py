import json

from openai import OpenAI

from app.core.config import settings
from app.db.models.rawlog import RawLog


SYSTEM_PROMPT = (
    "You are aiLog's conversation assistant. Answer directly and naturally. "
    "When the user asks for judgment, explanation, or a decision, start with the conclusion. "
    "Use provided aiLog memory context when it helps continuity, but do not mention RawLog, Turn, Episode, "
    "retrieval, or internal storage unless the user asks about aiLog internals. "
    "If web search is used, ground factual or up-to-date claims in the searched sources. "
    "Avoid unnecessary defensive hedging; be precise about uncertainty only when it matters."
)


class LLMClient:
    def __init__(self) -> None:
        if not settings.openai_api_key:
            raise RuntimeError("OPENAI_API_KEY is not configured")
        self.client = OpenAI(api_key=settings.openai_api_key)
        self.model = settings.openai_model
        self.embedding_model = settings.openai_embedding_model

    def generate_reply(
        self,
        rawlogs: list[RawLog],
        memory_context: str | None = None,
        use_web_search: bool = True,
    ) -> tuple[str, str, list[dict]]:
        instructions = SYSTEM_PROMPT
        if memory_context:
            instructions = (
                f"{instructions}\n\n"
                "Relevant aiLog memory context follows. Use it as background only; do not quote it as a source "
                "unless the user asks for stored conversation details.\n\n"
                f"{memory_context}"
            )

        request = {
            "model": self.model,
            "instructions": instructions,
            "input": [
                {
                    "role": rawlog.speaker_type,
                    "content": rawlog.content,
                }
                for rawlog in rawlogs
                if rawlog.speaker_type in {"user", "assistant", "system"}
            ],
        }
        if use_web_search:
            request["tools"] = [{"type": "web_search"}]
            request["tool_choice"] = "auto"
            request["include"] = ["web_search_call.action.sources"]

        response = self.client.responses.create(
            **request,
        )
        content = (response.output_text or "").strip()
        if not content:
            raise RuntimeError("OpenAI returned an empty response")
        return content, self.model, self._extract_sources(response)

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        response = self.client.embeddings.create(
            model=self.embedding_model,
            input=texts,
        )
        return [item.embedding for item in response.data]

    def _extract_sources(self, response) -> list[dict]:
        sources: list[dict] = []
        seen_urls: set[str] = set()

        for output in getattr(response, "output", []) or []:
            action = getattr(output, "action", None)
            for source in getattr(action, "sources", []) or []:
                url = getattr(source, "url", None)
                if url and url not in seen_urls:
                    seen_urls.add(url)
                    sources.append({"url": url, "title": getattr(source, "title", None)})

            for content in getattr(output, "content", []) or []:
                for annotation in getattr(content, "annotations", []) or []:
                    url = getattr(annotation, "url", None)
                    if url and url not in seen_urls:
                        seen_urls.add(url)
                        sources.append({"url": url, "title": getattr(annotation, "title", None)})

        return sources

    def build_episodes(self, turns: list[dict]) -> list[dict]:
        response = self.client.responses.create(
            model=self.model,
            instructions=(
                "You are aiLog's semantic episode builder. "
                "Read conversation turns and group turns that share the same user goal, topic, problem, or context. "
                "Do not group by connective words alone. Do not copy full conversation text into summaries. "
                "Separate display metadata from embedding evidence. "
                "title, summary, keywords, and episode_type are for UI and coarse filtering. "
                "semantic_text is for embedding, search, and merge decisions. It must describe the user's goal, "
                "context, insight, situational cue, and short representative evidence without becoming a label list. "
                "Return JSON only with this shape: "
                "{\"episodes\":[{\"title\":\"...\",\"summary\":\"...\",\"episode_type\":\"topic\","
                "\"emotion_signal\":null,\"importance_score\":0.0,\"keywords\":[\"...\"],"
                "\"user_goal\":\"...\",\"context\":\"...\",\"decision_or_insight\":\"...\","
                "\"emotional_or_situational_cue\":null,\"representative_snippets\":[\"...\"],"
                "\"semantic_text\":\"...\","
                "\"rawlog_ids\":[\"...\"]}]}. "
                "Each rawlog_id must come from the provided turns. Preserve source rawlog_ids exactly."
            ),
            input=(
                "Build semantic episodes from these turns. "
                "A summary should describe the shared context in one concise sentence, not reproduce the dialog. "
                "semantic_text should be richer than the summary and should be optimized for later natural-language "
                "recall queries such as vague references, remembered situations, or prior insights.\n\n"
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
