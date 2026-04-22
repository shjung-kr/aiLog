from pydantic import BaseModel

class LongTermMemoryBase(BaseModel):
    memory_id: str
