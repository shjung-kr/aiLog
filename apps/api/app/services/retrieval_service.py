from math import sqrt

from app.db.models.episode import Episode
from app.db.models.rawlog import RawLog
from app.db.repositories.episode_repository import EpisodeRepository
from app.llm.client import LLMClient
from app.services.rawlog_service import RawLogService

EMBEDDING_METADATA_KEY = "semantic_embedding"
RETRIEVAL_SCORE_THRESHOLD = 0.25


class RetrievalService:
    def __init__(
        self,
        episode_repository: EpisodeRepository,
        rawlog_service: RawLogService,
        llm_client: LLMClient,
    ) -> None:
        self.episode_repository = episode_repository
        self.rawlog_service = rawlog_service
        self.llm_client = llm_client

    def retrieve_for_query(self, query: str, limit: int = 3, max_rawlogs: int = 8) -> tuple[str | None, list[dict]]:
        query = query.strip()
        if not query:
            return None, []

        query_embedding = self.llm_client.embed_texts([query])[0]
        candidates: list[tuple[float, Episode]] = []
        for episode in self.episode_repository.list_all(limit=500):
            embedding = (episode.metadata_json or {}).get(EMBEDDING_METADATA_KEY)
            if not isinstance(embedding, list):
                continue
            score = self._cosine_similarity(query_embedding, [float(value) for value in embedding])
            if score >= RETRIEVAL_SCORE_THRESHOLD:
                candidates.append((score, episode))

        ranked = sorted(candidates, key=lambda item: item[0], reverse=True)[:limit]
        if not ranked:
            return None, []

        context_blocks: list[str] = []
        context_items: list[dict] = []
        remaining_rawlogs = max_rawlogs
        for score, episode in ranked:
            rawlogs = self.episode_repository.list_rawlogs(episode.episode_id)
            selected_rawlogs = rawlogs[: max(0, remaining_rawlogs)]
            remaining_rawlogs -= len(selected_rawlogs)
            context_items.append(
                {
                    "episode_id": episode.episode_id,
                    "title": episode.title,
                    "score": round(score, 4),
                    "rawlog_ids": [rawlog.rawlog_id for rawlog in selected_rawlogs],
                }
            )
            context_blocks.append(self._format_episode_context(score, episode, selected_rawlogs))
            if remaining_rawlogs <= 0:
                break

        return "\n\n".join(context_blocks), context_items

    def _format_episode_context(self, score: float, episode: Episode, rawlogs: list[RawLog]) -> str:
        lines = [
            f"[Episode: {episode.title}]",
            f"Similarity: {score:.3f}",
            f"Summary: {episode.summary}",
        ]
        if episode.keywords:
            lines.append(f"Keywords: {', '.join(episode.keywords)}")
        if rawlogs:
            lines.append("Original conversation snippets:")
            for rawlog in rawlogs:
                content = rawlog.content.replace("\n", " ").strip()
                if len(content) > 360:
                    content = f"{content[:357]}..."
                lines.append(f"- {rawlog.speaker_type}: {content}")
        return "\n".join(lines)

    def _cosine_similarity(self, left: list[float], right: list[float]) -> float:
        if not left or not right or len(left) != len(right):
            return 0.0
        dot = sum(left_value * right_value for left_value, right_value in zip(left, right))
        left_norm = sqrt(sum(value * value for value in left))
        right_norm = sqrt(sum(value * value for value in right))
        if left_norm == 0 or right_norm == 0:
            return 0.0
        return dot / (left_norm * right_norm)
