from pydantic import BaseModel


class RetrievalRequest(BaseModel):
    query: str
    session_id: str | None = None


class RetrievalEpisode(BaseModel):
    episode_id: str
    title: str
    score: float
    rawlog_ids: list[str] = []


class RetrievalResponse(BaseModel):
    query: str
    semantic_text: str | None
    episodes: list[RetrievalEpisode]
