from pydantic import BaseModel

class GistBase(BaseModel):
    gist_id: str
