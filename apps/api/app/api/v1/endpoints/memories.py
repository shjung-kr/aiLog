from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.repositories.episode_repository import EpisodeRepository
from app.db.repositories.long_term_memory_repository import LongTermMemoryRepository
from app.db.repositories.rawlog_repository import RawLogRepository
from app.db.repositories.session_repository import SessionRepository
from app.db.session import get_db
from app.schemas.long_term_memory import LongTermMemoryRead, PromoteResponse
from app.services.episode_service import EpisodeService
from app.services.memory_promotion_service import MemoryPromotionService
from app.services.rawlog_service import RawLogService
from app.services.session_service import SessionService

router = APIRouter()


def _build_promotion_service(db: Session) -> MemoryPromotionService:
    session_service = SessionService(SessionRepository(db))
    rawlog_service = RawLogService(RawLogRepository(db), session_service)
    episode_service = EpisodeService(EpisodeRepository(db), rawlog_service)
    ltm_repository = LongTermMemoryRepository(db)
    return MemoryPromotionService(ltm_repository=ltm_repository, episode_service=episode_service)


@router.get("", response_model=list[LongTermMemoryRead])
def list_memories(limit: int = 100, db: Session = Depends(get_db)) -> list[LongTermMemoryRead]:
    repo = LongTermMemoryRepository(db)
    memories = repo.list_all(limit=limit)
    return [LongTermMemoryRead.from_orm_with_metadata(m) for m in memories]


@router.post("/promote", response_model=PromoteResponse)
def promote_memories(db: Session = Depends(get_db)) -> PromoteResponse:
    """Scan all episodes and promote eligible ones to long-term memory."""
    service = _build_promotion_service(db)
    repo = LongTermMemoryRepository(db)

    before_ids = {m.memory_id for m in repo.list_all(limit=1000)}
    promoted_memories = service.run_full_promotion()

    newly_created = sum(1 for m in promoted_memories if m.memory_id not in before_ids)
    updated = len(promoted_memories) - newly_created
    total = len(repo.list_all(limit=1000))

    return PromoteResponse(promoted=newly_created, updated=updated, total_long_term_memories=total)
