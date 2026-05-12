from datetime import datetime

from pydantic import BaseModel, ConfigDict


class GistRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    gist_id: str
    start_rawlog_id: str
    end_rawlog_id: str
    title: str
    gist_text: str
    topic: str | None
    intent: str | None
    created_at: datetime
    confidence: float | None
