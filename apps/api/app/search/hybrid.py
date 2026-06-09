from collections.abc import Callable
from dataclasses import dataclass

from app.db.models.episode import Episode
from app.search.fulltext import FullTextSearch
from app.search.vector import VectorSearch


@dataclass(frozen=True)
class HybridSearchResult:
    episode: Episode
    score: float


class HybridSearch:
    def __init__(
        self,
        vector_search: VectorSearch | None = None,
        fulltext_search: FullTextSearch | None = None,
        keyword_weight: float = 0.15,
    ) -> None:
        self.vector_search = vector_search or VectorSearch()
        self.fulltext_search = fulltext_search or FullTextSearch()
        self.keyword_weight = keyword_weight

    def rank_episodes(
        self,
        episodes: list[Episode],
        query_embedding: list[float],
        query_tokens: set[str],
        semantic_text_for: Callable[[Episode], str],
        embedding_key: str,
        title_embedding_key: str,
        threshold: float,
        limit: int,
    ) -> list[HybridSearchResult]:
        results: list[HybridSearchResult] = []
        for episode in episodes:
            metadata = episode.metadata_json or {}
            embedding = metadata.get(embedding_key)
            if not isinstance(embedding, list):
                continue

            vector_score = self.vector_search.cosine_similarity(
                query_embedding,
                [float(value) for value in embedding],
            )
            title_embedding = metadata.get(title_embedding_key)
            if isinstance(title_embedding, list):
                vector_score = max(
                    vector_score,
                    self.vector_search.cosine_similarity(
                        query_embedding,
                        [float(value) for value in title_embedding],
                    ),
                )

            semantic_text = semantic_text_for(episode)
            keyword_score = self.fulltext_search.keyword_overlap(query_tokens, semantic_text)
            score = vector_score * (1 - self.keyword_weight) + keyword_score * self.keyword_weight
            if metadata.get("promoted_to_ltm"):
                score += 0.05
            if score >= threshold:
                results.append(HybridSearchResult(episode=episode, score=score))

        return sorted(results, key=lambda result: result.score, reverse=True)[:limit]
