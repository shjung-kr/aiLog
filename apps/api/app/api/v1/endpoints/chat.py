from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.repositories.rawlog_repository import RawLogRepository
from app.db.repositories.episode_repository import EpisodeRepository
from app.db.repositories.session_repository import SessionRepository
from app.db.repositories.turn_repository import TurnRepository
from app.db.session import get_db
from app.llm.client import LLMClient
from app.schemas.chat import ChatContextItem, ChatMessageCreate, ChatMessageResponse, ChatSource
from app.schemas.rawlog import RawLogRead
from app.services.chat_service import ChatService
from app.services.episode_idle_scheduler import episode_idle_scheduler
from app.services.rawlog_service import RawLogService
from app.services.retrieval_service import RetrievalService
from app.services.session_service import SessionService
from app.services.turn_service import TurnService

router = APIRouter()


@router.post("/messages", response_model=ChatMessageResponse, status_code=status.HTTP_201_CREATED)
def send_chat_message(payload: ChatMessageCreate, db: Session = Depends(get_db)) -> ChatMessageResponse:
    session_service = SessionService(SessionRepository(db))
    rawlog_service = RawLogService(RawLogRepository(db), session_service)
    turn_service = TurnService(TurnRepository(db), rawlog_service)
    llm_client = LLMClient()
    retrieval_service = RetrievalService(EpisodeRepository(db), rawlog_service, llm_client)

    try:
        chat_service = ChatService(
            session_service=session_service,
            rawlog_service=rawlog_service,
            llm_client=llm_client,
            turn_service=turn_service,
            retrieval_service=retrieval_service,
        )
        session_id, user_message, assistant_message, sources, context_used = chat_service.send_message(payload)
        episode_idle_scheduler.schedule(session_id)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    return ChatMessageResponse(
        session_id=session_id,
        user_message=RawLogRead.model_validate(user_message),
        assistant_message=RawLogRead.model_validate(assistant_message),
        sources=[ChatSource(**source) for source in sources],
        context_used=[ChatContextItem(**item) for item in context_used],
    )
