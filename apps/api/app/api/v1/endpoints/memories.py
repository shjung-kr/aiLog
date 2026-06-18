from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import verify_api_key
from app.db.repositories.episode_repository import EpisodeRepository
from app.db.repositories.long_term_memory_repository import LongTermMemoryRepository
from app.db.repositories.rawlog_repository import RawLogRepository
from app.db.repositories.session_repository import SessionRepository
from app.db.session import get_db
from app.llm.client import LLMClient
from app.pipeline.memory.memory_decay import MemoryDecay
from app.schemas.long_term_memory import DecayResponse, LongTermMemoryRead, PromoteResponse
from app.services.episode_service import EpisodeService
from app.services.memory_promotion_service import MemoryPromotionService
from app.services.rawlog_service import RawLogService
from app.services.session_service import SessionService
from app.services.user_style_service import UserStyleService

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


@router.post("/analyze-style", dependencies=[Depends(verify_api_key)])
def analyze_style(db: Session = Depends(get_db)) -> dict:
    """기존 대화 전체를 분석해 사용자 스타일 프로파일을 생성/갱신한다."""
    service = UserStyleService(
        ltm_repository=LongTermMemoryRepository(db),
        rawlog_repository=RawLogRepository(db),
        llm_client=LLMClient(),
    )
    profile = service.analyze_and_update()
    if profile is None:
        return {"status": "skipped", "reason": "not enough messages"}
    db.commit()
    return {"status": "ok", "profile": profile}


@router.post("/decay", response_model=DecayResponse, dependencies=[Depends(verify_api_key)])
def decay_memories(threshold: float | None = None, db: Session = Depends(get_db)) -> DecayResponse:
    """Delete low-importance episodes. LTM-promoted episodes are always protected."""
    effective_threshold = threshold if threshold is not None else settings.memory_decay_threshold
    episode_repo = EpisodeRepository(db)
    rawlog_service = RawLogService(RawLogRepository(db), SessionService(SessionRepository(db)))
    episode_service = EpisodeService(episode_repo, rawlog_service)

    candidates = episode_repo.list_below_score(effective_threshold)
    to_delete = MemoryDecay().filter_for_deletion(candidates)
    protected = len(candidates) - len(to_delete)

    for episode in to_delete:
        episode_service.delete_episode(episode.episode_id)
    db.commit()

    return DecayResponse(deleted=len(to_delete), protected=protected, threshold=effective_threshold)


@router.post("/promote", response_model=PromoteResponse, dependencies=[Depends(verify_api_key)])
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
