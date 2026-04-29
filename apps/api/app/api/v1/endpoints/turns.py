from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.repositories.rawlog_repository import RawLogRepository
from app.db.repositories.session_repository import SessionRepository
from app.db.repositories.turn_repository import TurnRepository
from app.db.session import get_db
from app.schemas.turn import TurnRead
from app.services.rawlog_service import RawLogService
from app.services.session_service import SessionService
from app.services.turn_service import TurnService

router = APIRouter()


def _build_service(db: Session) -> TurnService:
    session_service = SessionService(SessionRepository(db))
    rawlog_service = RawLogService(RawLogRepository(db), session_service)
    return TurnService(TurnRepository(db), rawlog_service)


@router.get("", response_model=list[TurnRead])
def list_turns(session_id: str, db: Session = Depends(get_db)) -> list[TurnRead]:
    turn_service = _build_service(db)
    try:
        turns = turn_service.list_session_turns(session_id)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return [TurnRead.model_validate(turn) for turn in turns]


@router.post("/from-session/{session_id}", response_model=list[TurnRead], status_code=status.HTTP_201_CREATED)
def build_turns_from_session(session_id: str, db: Session = Depends(get_db)) -> list[TurnRead]:
    turn_service = _build_service(db)
    try:
        turns = turn_service.build_from_session(session_id)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return [TurnRead.model_validate(turn) for turn in turns]
