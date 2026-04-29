from app.llm.client import LLMClient
from app.schemas.chat import ChatMessageCreate
from app.services.rawlog_service import RawLogService
from app.services.session_service import SessionService
from app.services.turn_service import TurnService
from app.utils.datetime import utc_now


class ChatService:
    def __init__(
        self,
        session_service: SessionService,
        rawlog_service: RawLogService,
        llm_client: LLMClient,
        turn_service: TurnService | None = None,
    ) -> None:
        self.session_service = session_service
        self.rawlog_service = rawlog_service
        self.llm_client = llm_client
        self.turn_service = turn_service

    def send_message(self, payload: ChatMessageCreate):
        session_id = payload.session_id
        if session_id is None:
            session = self.session_service.create_session(user_id=payload.user_id, title=payload.title)
            session_id = session.session_id
        else:
            self.session_service.require_session(session_id)

        user_message = self.rawlog_service.create_rawlog(
            session_id=session_id,
            sequence_no=self.rawlog_service.get_next_sequence_no(session_id),
            speaker_type="user",
            content=payload.content,
            occurred_at=utc_now(),
            message_type="question",
            metadata=payload.metadata,
        )

        conversation = self.rawlog_service.list_session_rawlogs(session_id)
        assistant_text, source_model = self.llm_client.generate_reply(conversation)
        assistant_message = self.rawlog_service.create_rawlog(
            session_id=session_id,
            sequence_no=self.rawlog_service.get_next_sequence_no(session_id),
            speaker_type="assistant",
            content=assistant_text,
            occurred_at=utc_now(),
            message_type="answer",
            source_model=source_model,
            reply_to_rawlog_id=user_message.rawlog_id,
        )
        if self.turn_service is not None:
            self.turn_service.create_from_pair(user_message, assistant_message)
        return session_id, user_message, assistant_message
