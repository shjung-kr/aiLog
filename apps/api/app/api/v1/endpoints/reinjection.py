from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.repositories.episode_repository import EpisodeRepository
from app.db.repositories.rawlog_repository import RawLogRepository
from app.db.repositories.search_repository import SearchRepository
from app.db.repositories.session_repository import SessionRepository
from app.db.session import get_db
from app.llm.client import LLMClient
from app.schemas.reinjection import ReinjectionEpisode, ReinjectionRequest, ReinjectionResponse
from app.services.rawlog_service import RawLogService
from app.services.reinjection_service import ReinjectionService
from app.services.retrieval_service import RetrievalService
from app.services.session_service import SessionService

router = APIRouter()


@router.post("", response_model=ReinjectionResponse)
def reinject(payload: ReinjectionRequest, db: Session = Depends(get_db)) -> ReinjectionResponse:
    session_service = SessionService(SessionRepository(db))
    rawlog_service = RawLogService(RawLogRepository(db), session_service)
    llm_client = LLMClient()
    retrieval_service = RetrievalService(
        EpisodeRepository(db),
        rawlog_service,
        llm_client,
        SearchRepository(db),
    )
    reinjection_service = ReinjectionService(retrieval_service)

    try:
        injected_context, episodes = reinjection_service.build_injected_context(
            payload.query,
            session_id=payload.session_id,
            recent_turns=payload.recent_turns,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    return ReinjectionResponse(
        query=payload.query,
        injected_context=injected_context,
        episodes=[
            ReinjectionEpisode(
                episode_id=e["episode_id"],
                title=e["title"],
                score=e["score"],
            )
            for e in episodes
        ],
        has_context=injected_context is not None,
    )
