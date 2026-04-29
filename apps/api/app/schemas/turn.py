from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class TurnRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    turn_id: str
    session_id: str
    start_rawlog_id: str
    end_rawlog_id: str
    started_at: datetime
    ended_at: datetime
    metadata: dict | None = Field(default=None, validation_alias="metadata_json")
