from fastapi import APIRouter
from app.api.v1.endpoints import chat, episodes, gists, memories, rawlogs, reinjection, retrieval, sessions, turns

api_router = APIRouter()
api_router.include_router(chat.router, prefix="/chat", tags=["chat"])
api_router.include_router(sessions.router, prefix="/sessions", tags=["sessions"])
api_router.include_router(rawlogs.router, prefix="/rawlogs", tags=["rawlogs"])
api_router.include_router(turns.router, prefix="/turns", tags=["turns"])
api_router.include_router(gists.router, prefix="/gists", tags=["gists"])
api_router.include_router(episodes.router, prefix="/episodes", tags=["episodes"])
api_router.include_router(memories.router, prefix="/memories", tags=["memories"])
api_router.include_router(retrieval.router, prefix="/retrieval", tags=["retrieval"])
api_router.include_router(reinjection.router, prefix="/reinjection", tags=["reinjection"])
