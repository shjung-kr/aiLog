from datetime import datetime

from pydantic import BaseModel, ConfigDict


class SessionCreate(BaseModel):
    user_id: str | None = None
    title: str | None = None


class SessionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    session_id: str
    user_id: str | None = None
    title: str | None = None
    started_at: datetime
    last_activity_at: datetime
    status: str
