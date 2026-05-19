from datetime import datetime

from pydantic import BaseModel, ConfigDict


class LongTermMemoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    memory_id: str
    episode_id: str
    title: str
    memory_text: str
    memory_type: str
    importance_score: float | None
    created_at: datetime
    metadata: dict | None = None

    @classmethod
    def from_orm_with_metadata(cls, memory: object) -> "LongTermMemoryRead":
        from app.db.models.long_term_memory import LongTermMemory
        m: LongTermMemory = memory  # type: ignore[assignment]
        return cls(
            memory_id=m.memory_id,
            episode_id=m.episode_id,
            title=m.title,
            memory_text=m.memory_text,
            memory_type=m.memory_type,
            importance_score=m.importance_score,
            created_at=m.created_at,
            metadata=m.metadata_json,
        )


class PromoteResponse(BaseModel):
    promoted: int
    updated: int
    total_long_term_memories: int
