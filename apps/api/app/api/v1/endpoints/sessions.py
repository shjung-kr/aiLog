from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.repositories.rawlog_repository import RawLogRepository
from app.db.repositories.session_repository import SessionRepository
from app.db.session import get_db
from app.schemas.rawlog import RawLogRead, SessionRawLogsRead
from app.schemas.session import SessionCreate, SessionRead
from app.services.rawlog_service import RawLogService
from app.services.session_service import SessionService

router = APIRouter()


def _build_services(db: Session) -> tuple[SessionService, RawLogService]:
    session_service = SessionService(SessionRepository(db))
    rawlog_service = RawLogService(RawLogRepository(db), session_service)
    return session_service, rawlog_service


@router.post("", response_model=SessionRead, status_code=status.HTTP_201_CREATED)
def create_session(payload: SessionCreate, db: Session = Depends(get_db)) -> SessionRead:
    session_service, _ = _build_services(db)
    session = session_service.create_session(user_id=payload.user_id, title=payload.title)
    return SessionRead.model_validate(session)


@router.get("", response_model=list[SessionRead])
def list_sessions(limit: int = 50, db: Session = Depends(get_db)) -> list[SessionRead]:
    session_service, _ = _build_services(db)
    sessions = session_service.list_sessions(limit=limit)
    return [SessionRead.model_validate(session) for session in sessions]


@router.get("/{session_id}/rawlogs", response_model=SessionRawLogsRead)
def read_session_rawlogs(session_id: str, db: Session = Depends(get_db)) -> SessionRawLogsRead:
    _, rawlog_service = _build_services(db)
    try:
        rawlogs = rawlog_service.list_session_rawlogs(session_id)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    messages = [RawLogRead.model_validate(rawlog) for rawlog in rawlogs]
    return SessionRawLogsRead(session_id=session_id, messages=messages)
