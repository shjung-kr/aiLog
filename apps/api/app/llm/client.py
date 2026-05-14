import json

from openai import OpenAI

from app.core.config import settings
from app.db.models.rawlog import RawLog


SYSTEM_PROMPT = (
    "You are aiLog, a personal AI assistant. "
    "You are NOT ChatGPT. Never describe yourself as ChatGPT, never reference OpenAI help pages "
    "or ChatGPT's memory settings. You are a distinct assistant. "
    "\n\n"
    "You have a long-term memory system that stores past conversations. "
    "When the user asks if you remember something or references a past conversation: "
    "— If background memory context is provided above, you have retrieved a relevant memory. "
    "  Use those details naturally without flagging it as a memory retrieval. "
    "— If NO background memory context is provided, you have zero information about past conversations. "
    "  Say briefly that you don't recall that conversation right now, and stop. "
    "  NEVER attempt to reconstruct, guess, infer, or fabricate what was discussed. "
    "  Never produce plausible-sounding summaries of conversations you have no context for — "
    "  this is hallucination and destroys trust. "
    "  One short honest sentence, then invite the user to re-share if they want. "
    "\n\n"
    "CRITICAL: Only claim to remember something if it appears in the background memory context. "
    "\n\n"
    "When using background memory context, weave it naturally — never say '기억하고 있어요', "
    "'지난번에 말씀하신', 'I remember', or any phrase that explicitly flags a memory retrieval. "
    "If the context is not relevant, ignore it. "
    "\n\n"
    "Be direct and conversational. Lead with the answer, not a preamble. "
    "Do not ask for permission to answer — just answer. "
    "Avoid phrases like '원하시면 ~해드릴게요' when the user has already asked something specific. "
    "Do not mention RawLog, Turn, Episode, retrieval, or internal architecture. "
    "If web search is used, ground factual claims in the searched sources. "
    "Match the user's language and tone naturally."
)

_SEMANTIC_TEXT_INSTRUCTION = (
    "semantic_text is the most important field: it is both the embedding index and the context injection material. "
    "Write semantic_text as a first-person retrospective narrative — the kind of internal monologue "
    "a person would write in a personal log: '~을 시도했는데 ~해서 ~로 바꿨다', '~가 문제였고 그래서 ~를 결정했다'. "
    "Include: what the user was trying to do, what happened or was discovered, why a decision was made, "
    "and what changed as a result. "
    "Forbidden styles in semantic_text: third-person observation ('사용자가 ~를 했다'), "
    "fact-card lists (bullet-point style), meta-commentary ('이 에피소드는 ~에 관한 것이다'). "
    "Target length: 60-150 tokens. Dense and self-contained. "
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
                "--- Background memory context (do not quote, do not reference as memory, "
                "weave naturally or ignore if irrelevant) ---\n"
                f"{memory_context}"
            )

        request = {
            "model": self.model,
            "instructions": instructions,
            "store": False,  # Do not store on OpenAI side; aiLog manages its own memory
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

        response = self.client.responses.create(**request)
        content = (response.output_text or "").strip()
        if not content:
            raise RuntimeError("OpenAI returned an empty response")
        return content, self.model, self._extract_sources(response)

    def curate_episodes(
        self,
        query: str,
        candidates: list[dict],
        conversation_context: list[str] | None = None,
    ) -> tuple[list[str], str]:
        """
        Curator step: filter N embedding candidates down to genuinely contextually relevant ones.
        Returns (relevant_episode_ids, reasoning).
        Conservative by design — when uncertain, exclude.
        conversation_context: recent turns (speaker: content) to help judge follow-up messages.
        """
        if not candidates:
            return [], ""

        candidates_text = "\n\n".join(
            f"[episode_id: {c['episode_id']}]\n{c['semantic_text']}"
            for c in candidates
        )

        context_section = ""
        if conversation_context:
            context_section = (
                "\n\nRecent conversation context (for understanding follow-up messages):\n"
                + "\n".join(conversation_context[-4:])
            )

        response = self.client.responses.create(
            model=self.model,
            store=False,
            instructions=(
                "You are a memory relevance curator for a personal AI assistant. "
                "Given the user's current utterance and candidate memory episodes, "
                "decide which episodes are genuinely relevant to what the user is talking about RIGHT NOW. "
                "If the current utterance is a follow-up (e.g. '더 설명해줘', '계속해줘', '아까 말한 거'), "
                "use the recent conversation context to infer the actual topic being discussed. "
                "Be conservative: exclude when uncertain. "
                "A false positive (irrelevant episode injected into the response) damages conversational trust "
                "more than a false negative (missing a relevant memory). "
                "Return JSON only: {\"relevant_ids\": [\"id1\", ...], \"reasoning\": \"one sentence\"}"
            ),
            input=(
                f"User's current utterance:\n{query}"
                f"{context_section}\n\n"
                f"Candidate memory episodes:\n{candidates_text}\n\n"
                "Return only the episode_ids that are genuinely relevant to this specific utterance. "
                "When in doubt, exclude. JSON only."
            ),
        )
        content = (response.output_text or "").strip()
        return self._parse_curator_response(content)

    def _parse_curator_response(self, content: str) -> tuple[list[str], str]:
        try:
            data = json.loads(content)
        except json.JSONDecodeError:
            start = content.find("{")
            end = content.rfind("}")
            if start < 0 or end < start:
                return [], ""
            try:
                data = json.loads(content[start : end + 1])
            except json.JSONDecodeError:
                return [], ""
        relevant_ids = data.get("relevant_ids", [])
        reasoning = str(data.get("reasoning", "") or "")
        if not isinstance(relevant_ids, list):
            return [], reasoning
        return [str(id_) for id_ in relevant_ids if id_], reasoning

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

    def merge_semantic_text(self, text_a: str, text_b: str) -> str:
        response = self.client.responses.create(
            model=self.model,
            store=False,
            instructions=(
                "You are aiLog's episode semantic text merger. "
                "Given two semantic texts from related episodes being merged, "
                "synthesize a single first-person retrospective narrative that captures "
                "the combined user goals, decisions, context, and key insights from both. "
                "Write as a personal log entry: '~을 시도했는데 ~해서 ~로 바꿨다' style. "
                "Be dense and precise. Synthesize — do not list or concatenate. "
                "Write in the same language as the input. If the input is Korean, respond in Korean. "
                "Target length: 60-150 tokens. "
                "Return only the merged semantic text, no JSON, no labels, no preamble."
            ),
            input=f"Merge these two episode semantic texts into one:\n\nA:\n{text_a}\n\nB:\n{text_b}",
        )
        result = (response.output_text or "").strip()
        if not result:
            raise RuntimeError("OpenAI returned empty merged semantic text")
        return result

    def build_episodes(self, turns: list[dict]) -> list[dict]:
        response = self.client.responses.create(
            model=self.model,
            store=False,
            instructions=(
                "You are aiLog's semantic episode builder. "
                "Read conversation turns and group turns that share the same user goal, topic, problem, or context. "
                "Do not group by connective words alone. Do not copy full conversation text into summaries. "
                "Separate display metadata from embedding evidence. "
                "title, summary, keywords, and episode_type are for UI and coarse filtering. "
                "IMPORTANT — skip these turn types entirely, do NOT create episodes for them: "
                "(1) turns where the assistant says it cannot recall or failed to retrieve past conversations; "
                "(2) turns that are only about checking whether a past conversation happened; "
                "(3) meta-commentary about the memory system itself unless it contains a concrete design decision. "
                "Only create episodes for turns that contain actual content: facts learned, decisions made, "
                "problems solved, topics explained, or insights reached. "
                f"{_SEMANTIC_TEXT_INSTRUCTION}"
                "Write all text fields in the same language as the conversation. If the conversation is in Korean, "
                "write title, summary, keywords, semantic_text, and all other text fields in Korean. "
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
                "semantic_text must be a first-person retrospective narrative (personal log style), "
                "optimized for later natural-language recall queries such as vague references, "
                "remembered situations, or prior insights.\n\n"
                f"{json.dumps({'turns': turns}, ensure_ascii=False)}"
            ),
        )
        content = (response.output_text or "").strip()
        if not content:
            raise RuntimeError("OpenAI returned an empty episode build response")
        return self._parse_episode_json(content)

    def build_gist(self, segment_turns: list[dict]) -> dict:
        response = self.client.responses.create(
            model=self.model,
            store=False,
            instructions=(
                "You are aiLog's semantic gist extractor. "
                "Given conversation turns, produce a compact semantic summary capturing what the user was trying "
                "to accomplish, what was decided or learned, and key context. "
                "Do not reproduce dialogue. Be dense and precise. "
                "Write all text fields in the same language as the conversation. "
                "If the conversation is in Korean, write title, gist_text, topic, and intent in Korean. "
                "Return JSON only: "
                "{\"title\": \"...\", \"gist_text\": \"...\", \"topic\": \"...\", "
                "\"intent\": \"...\", \"confidence\": 0.0}"
            ),
            input=(
                "Extract a gist from these conversation turns:\n\n"
                f"{json.dumps({'turns': segment_turns}, ensure_ascii=False)}"
            ),
        )
        content = (response.output_text or "").strip()
        if not content:
            raise RuntimeError("OpenAI returned an empty gist response")
        return self._parse_gist_json(content)

    def _parse_gist_json(self, content: str) -> dict:
        try:
            data = json.loads(content)
        except json.JSONDecodeError:
            start = content.find("{")
            end = content.rfind("}")
            if start < 0 or end < start:
                raise RuntimeError("OpenAI did not return valid JSON for gist") from None
            data = json.loads(content[start : end + 1])
        if not isinstance(data, dict):
            raise RuntimeError("Gist JSON must be an object")
        return data

    def build_episodes_from_gists(self, gist_segments: list[dict]) -> list[dict]:
        response = self.client.responses.create(
            model=self.model,
            store=False,
            instructions=(
                "You are aiLog's semantic episode builder. "
                "Read gist segments — each is a compressed summary of a conversation chunk — "
                "and group gists that share the same user goal, topic, problem, or context into episodes. "
                "Do not group by connective words alone. "
                "title, summary, keywords, and episode_type are for UI and coarse filtering. "
                "IMPORTANT — skip these gist types entirely, do NOT create episodes for them: "
                "(1) gists where the assistant says it cannot recall or failed to retrieve past conversations; "
                "(2) gists that are only about checking whether a past conversation happened; "
                "(3) meta-commentary about the memory system itself unless it contains a concrete design decision. "
                "Only create episodes for gists that contain actual content: facts learned, decisions made, "
                "problems solved, topics explained, or insights reached. "
                f"{_SEMANTIC_TEXT_INSTRUCTION}"
                "Write all text fields in the same language as the gist content. "
                "If the gists are in Korean, write title, summary, keywords, semantic_text, and all other text fields in Korean. "
                "Return JSON only with this shape: "
                "{\"episodes\":[{\"title\":\"...\",\"summary\":\"...\",\"episode_type\":\"topic\","
                "\"emotion_signal\":null,\"importance_score\":0.0,\"keywords\":[\"...\"],"
                "\"user_goal\":\"...\",\"context\":\"...\",\"decision_or_insight\":\"...\","
                "\"emotional_or_situational_cue\":null,\"representative_snippets\":[\"...\"],"
                "\"semantic_text\":\"...\","
                "\"rawlog_ids\":[\"...\"]}]}. "
                "Each rawlog_id must come from the provided gist segments' rawlog_ids exactly."
            ),
            input=(
                "Build semantic episodes from these gist segments. "
                "Each gist is a compressed summary of a conversation chunk. "
                "Group gists that share the same theme, goal, or problem into a single episode. "
                "semantic_text must be a first-person retrospective narrative (personal log style), "
                "optimized for natural-language recall queries.\n\n"
                f"{json.dumps({'gists': gist_segments}, ensure_ascii=False)}"
            ),
        )
        content = (response.output_text or "").strip()
        if not content:
            raise RuntimeError("OpenAI returned an empty episode build response from gists")
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
