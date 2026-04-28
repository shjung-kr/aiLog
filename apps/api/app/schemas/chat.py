from pydantic import BaseModel

from app.schemas.rawlog import RawLogRead


class ChatMessageCreate(BaseModel):
    session_id: str | None = None
    user_id: str | None = None
    title: str | None = None
    content: str
    metadata: dict | None = None


class ChatMessageResponse(BaseModel):
    session_id: str
    user_message: RawLogRead
    assistant_message: RawLogRead
