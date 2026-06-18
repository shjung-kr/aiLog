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
        keyword_weight_tech: float = 0.35,
        tech_boost_weight: float = 0.08,
    ) -> None:
        self.vector_search = vector_search or VectorSearch()
        self.fulltext_search = fulltext_search or FullTextSearch()
        self.keyword_weight = keyword_weight
        self.keyword_weight_tech = keyword_weight_tech
        self.tech_boost_weight = tech_boost_weight

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
        tech_query_tokens: set[str] | None = None,
        recall_intent: bool = False,
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

            # recall_intent + 기술 용어가 있을 때만 dynamic weight와 tech boost 발동
            if recall_intent and tech_query_tokens:
                tech_ratio = len(tech_query_tokens) / max(len(query_tokens), 1)
                effective_keyword_weight = self.keyword_weight_tech if tech_ratio >= 0.5 else self.keyword_weight
                tech_boost = self.fulltext_search.tech_exact_boost(tech_query_tokens, semantic_text) * self.tech_boost_weight
            else:
                effective_keyword_weight = self.keyword_weight
                tech_boost = 0.0

            score = vector_score * (1 - effective_keyword_weight) + keyword_score * effective_keyword_weight + tech_boost
            if metadata.get("promoted_to_ltm"):
                score += 0.05
            if score >= threshold:
                results.append(HybridSearchResult(episode=episode, score=score))

        return sorted(results, key=lambda result: result.score, reverse=True)[:limit]
