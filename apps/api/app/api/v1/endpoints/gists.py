from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.repositories.gist_repository import GistRepository
from app.db.repositories.rawlog_repository import RawLogRepository
from app.db.repositories.session_repository import SessionRepository
from app.db.repositories.turn_repository import TurnRepository
from app.db.session import get_db
from app.llm.client import LLMClient
from app.schemas.gist import GistRead
from app.services.gist_service import GistService
from app.services.rawlog_service import RawLogService
from app.services.session_service import SessionService
from app.services.turn_service import TurnService

router = APIRouter()


def _build_gist_service(db: Session) -> GistService:
    session_service = SessionService(SessionRepository(db))
    rawlog_service = RawLogService(RawLogRepository(db), session_service)
    turn_service = TurnService(TurnRepository(db), rawlog_service)
    return GistService(GistRepository(db), rawlog_service, turn_service, LLMClient())


@router.get("/session/{session_id}", response_model=list[GistRead])
def list_session_gists(session_id: str, db: Session = Depends(get_db)) -> list[GistRead]:
    gist_service = _build_gist_service(db)
    gists = gist_service.list_for_session(session_id)
    return [GistRead.model_validate(gist) for gist in gists]


@router.post("/generate/{session_id}", response_model=list[GistRead], status_code=status.HTTP_201_CREATED)
def generate_session_gists(session_id: str, db: Session = Depends(get_db)) -> list[GistRead]:
    gist_service = _build_gist_service(db)
    try:
        gists = gist_service.generate_for_session(session_id)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    return [GistRead.model_validate(gist) for gist in gists]
