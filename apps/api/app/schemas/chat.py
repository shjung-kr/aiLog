from pydantic import BaseModel

from app.schemas.rawlog import RawLogRead


class ChatSource(BaseModel):
    title: str | None = None
    url: str


class ChatContextItem(BaseModel):
    episode_id: str
    title: str
    score: float
    start_at: str | None = None
    rawlog_ids: list[str]
    recall_intent: bool = False


class ChatMessageCreate(BaseModel):
    session_id: str | None = None
    user_id: str | None = None
    title: str | None = None
    content: str
    metadata: dict | None = None
    use_web_search: bool | None = None


class ChatMessageResponse(BaseModel):
    session_id: str
    user_message: RawLogRead
    assistant_message: RawLogRead
    sources: list[ChatSource] = []
    context_used: list[ChatContextItem] = []
    style_updated: bool = False
