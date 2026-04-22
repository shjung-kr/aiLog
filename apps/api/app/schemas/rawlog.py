from pydantic import BaseModel

class RawLogBase(BaseModel):
    rawlog_id: str
