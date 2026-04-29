from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class EpisodeCreate(BaseModel):
    title: str
    summary: str
    episode_type: str = "topic"
    rawlog_ids: list[str]
    emotion_signal: str | None = None
    importance_score: float | None = None
    source_session_id: str | None = None
    keywords: list[str] | None = None
    metadata: dict | None = None


class EpisodeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    episode_id: str
    title: str
    summary: str
    episode_type: str
    start_rawlog_id: str
    end_rawlog_id: str
    start_at: datetime
    end_at: datetime
    emotion_signal: str | None = None
    importance_score: float | None = None
    source_session_id: str | None = None
    keywords: list[str] | None = None
    rawlog_ids: list[str] = Field(default_factory=list)
    metadata: dict | None = Field(default=None, validation_alias="metadata_json")


class EpisodeBuildRequest(BaseModel):
    rebuild_existing: bool = True
