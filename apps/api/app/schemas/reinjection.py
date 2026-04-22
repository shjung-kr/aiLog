from pydantic import BaseModel

class ReinjectionRequest(BaseModel):
    query: str
