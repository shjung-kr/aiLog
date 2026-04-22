from fastapi import APIRouter
from app.api.v1.endpoints import rawlogs, gists, episodes, memories, retrieval, reinjection

api_router = APIRouter()
api_router.include_router(rawlogs.router, prefix="/rawlogs", tags=["rawlogs"])
api_router.include_router(gists.router, prefix="/gists", tags=["gists"])
api_router.include_router(episodes.router, prefix="/episodes", tags=["episodes"])
api_router.include_router(memories.router, prefix="/memories", tags=["memories"])
api_router.include_router(retrieval.router, prefix="/retrieval", tags=["retrieval"])
api_router.include_router(reinjection.router, prefix="/reinjection", tags=["reinjection"])
