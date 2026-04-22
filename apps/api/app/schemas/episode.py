from pydantic import BaseModel

class EpisodeBase(BaseModel):
    episode_id: str
