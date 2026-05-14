from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.repositories.episode_repository import EpisodeRepository
from app.db.repositories.rawlog_repository import RawLogRepository
from app.db.repositories.search_repository import SearchRepository
from app.db.repositories.session_repository import SessionRepository
from app.db.session import get_db
from app.llm.client import LLMClient
from app.schemas.retrieval import RetrievalRequest, RetrievalResponse
from app.services.rawlog_service import RawLogService
from app.services.retrieval_service import RetrievalService
from app.services.session_service import SessionService

router = APIRouter()


@router.post("", response_model=RetrievalResponse)
def retrieve(payload: RetrievalRequest, db: Session = Depends(get_db)) -> RetrievalResponse:
    session_service = SessionService(SessionRepository(db))
    rawlog_service = RawLogService(RawLogRepository(db), session_service)
    llm_client = LLMClient()
    retrieval_service = RetrievalService(
        EpisodeRepository(db),
        rawlog_service,
        llm_client,
        SearchRepository(db),
    )

    try:
        semantic_text, context_items = retrieval_service.retrieve_for_query(
            payload.query,
            session_id=payload.session_id,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    return RetrievalResponse(
        query=payload.query,
        semantic_text=semantic_text,
        episodes=context_items,
    )
