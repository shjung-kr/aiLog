from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class RawLogCreate(BaseModel):
    session_id: str
    sequence_no: int
    speaker_type: str
    content: str
    occurred_at: datetime
    message_type: str | None = None
    reply_to_rawlog_id: str | None = None
    source_model: str | None = None
    metadata: dict | None = None


class RawLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    rawlog_id: str
    session_id: str
    sequence_no: int
    speaker_type: str
    content: str
    occurred_at: datetime
    message_type: str | None = None
    reply_to_rawlog_id: str | None = None
    source_model: str | None = None
    stored_at: datetime | None = None
    metadata: dict | None = Field(default=None, validation_alias="metadata_json")


class SessionRawLogsRead(BaseModel):
    session_id: str
    messages: list[RawLogRead]
