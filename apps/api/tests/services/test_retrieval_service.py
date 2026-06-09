from app.services.retrieval_service import RetrievalService


def make_service() -> RetrievalService:
    return RetrievalService.__new__(RetrievalService)


def test_parse_recall_query_strips_memory_meta_terms() -> None:
    service = make_service()

    parsed = service._parse_recall_query("지난번 특허성 이야기했던 거 핵심이 뭐였지?")

    assert parsed.recall_intent is True
    assert "특허성" in parsed.content_query
    assert "지난번" not in parsed.content_query
    assert parsed.answer_intent == "summary"


def test_build_embedding_query_uses_recent_turn_context() -> None:
    service = make_service()
    parsed = service._parse_recall_query("이어서 설명해줘")

    embedding_query = service._build_embedding_query(parsed, ["user: 특허 초안", "assistant: 청구항"])

    assert "user: 특허 초안" in embedding_query
    assert embedding_query.endswith("user: 이어서 설명해줘")
