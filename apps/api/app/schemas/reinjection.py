from pydantic import BaseModel


class ReinjectionRequest(BaseModel):
    query: str
    session_id: str | None = None
    recent_turns: list[str] | None = None


class ReinjectionEpisode(BaseModel):
    episode_id: str
    title: str
    score: float


class ReinjectionResponse(BaseModel):
    query: str
    injected_context: str | None
    episodes: list[ReinjectionEpisode]
    has_context: bool
