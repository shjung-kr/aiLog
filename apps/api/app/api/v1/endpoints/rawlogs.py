from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.repositories.rawlog_repository import RawLogRepository
from app.db.repositories.session_repository import SessionRepository
from app.db.repositories.turn_repository import TurnRepository
from app.db.session import get_db
from app.schemas.rawlog import RawLogCreate, RawLogRead
from app.services.rawlog_service import RawLogService
from app.services.session_service import SessionService
from app.services.turn_service import TurnService

router = APIRouter()


@router.post("", response_model=RawLogRead, status_code=status.HTTP_201_CREATED)
def create_rawlog(payload: RawLogCreate, db: Session = Depends(get_db)) -> RawLogRead:
    session_service = SessionService(SessionRepository(db))
    rawlog_service = RawLogService(RawLogRepository(db), session_service)
    turn_service = TurnService(TurnRepository(db), rawlog_service)

    try:
        rawlog = rawlog_service.create_rawlog(
            session_id=payload.session_id,
            sequence_no=payload.sequence_no,
            speaker_type=payload.speaker_type,
            content=payload.content,
            occurred_at=payload.occurred_at,
            message_type=payload.message_type,
            reply_to_rawlog_id=payload.reply_to_rawlog_id,
            source_model=payload.source_model,
            metadata=payload.metadata,
        )
        if rawlog.speaker_type == "assistant":
            turn_service.build_from_session(rawlog.session_id)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return RawLogRead.model_validate(rawlog)
