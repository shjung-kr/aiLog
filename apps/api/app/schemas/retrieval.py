from pydantic import BaseModel


class RetrievalRequest(BaseModel):
    query: str
    session_id: str | None = None


class RetrievalEpisode(BaseModel):
    episode_id: str
    title: str
    score: float
    start_at: str | None = None
    rawlog_ids: list[str] = []


class RetrievalResponse(BaseModel):
    query: str
    semantic_text: str | None
    episodes: list[RetrievalEpisode]
