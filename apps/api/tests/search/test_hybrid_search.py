from datetime import datetime, timezone

from app.db.models.episode import Episode
from app.search.hybrid import HybridSearch


def episode_with_embedding(episode_id: str, embedding: list[float], semantic_text: str) -> Episode:
    return Episode(
        episode_id=episode_id,
        title=f"Episode {episode_id}",
        summary=semantic_text,
        episode_type="topic",
        start_rawlog_id=f"raw-{episode_id}-1",
        end_rawlog_id=f"raw-{episode_id}-2",
        start_at=datetime.now(timezone.utc),
        end_at=datetime.now(timezone.utc),
        metadata_json={
            "semantic_embedding": embedding,
            "semantic_text": semantic_text,
        },
    )


def test_rank_episodes_combines_vector_and_keyword_scores() -> None:
    search = HybridSearch(keyword_weight=0.15)
    episodes = [
        episode_with_embedding("a", [1.0, 0.0], "특허성 검토와 청구항 정리"),
        episode_with_embedding("b", [0.0, 1.0], "저녁 메뉴 정리"),
    ]

    results = search.rank_episodes(
        episodes=episodes,
        query_embedding=[1.0, 0.0],
        query_tokens={"특허성"},
        semantic_text_for=lambda ep: ep.metadata_json["semantic_text"],
        embedding_key="semantic_embedding",
        title_embedding_key="title_embedding",
        threshold=0.1,
        limit=5,
    )

    assert [result.episode.episode_id for result in results] == ["a"]
