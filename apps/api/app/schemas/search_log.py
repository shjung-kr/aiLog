from datetime import datetime

from pydantic import BaseModel


class SearchLogRead(BaseModel):
    log_id: str
    query: str
    session_id: str | None
    retrieved: list[dict]
    curated: list[dict]
    used_episode_id: str | None
    curator_reasoning: str | None
    created_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def model_validate(cls, obj, **kwargs):
        data = {
            "log_id": obj.log_id,
            "query": obj.query,
            "session_id": obj.session_id,
            "retrieved": obj.retrieved_json or [],
            "curated": obj.curated_json or [],
            "used_episode_id": obj.used_episode_id,
            "curator_reasoning": obj.curator_reasoning,
            "created_at": obj.created_at,
        }
        return cls(**data)
