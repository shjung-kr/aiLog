from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.models.episode import Episode
from app.db.repositories.episode_repository import EpisodeRepository
from app.db.repositories.rawlog_repository import RawLogRepository
from app.db.repositories.session_repository import SessionRepository
from app.db.repositories.turn_repository import TurnRepository
from app.db.session import get_db
from app.llm.client import LLMClient
from app.schemas.episode import EpisodeBuildRequest, EpisodeCreate, EpisodeRead
from app.services.episode_builder_service import EpisodeBuilderService
from app.services.episode_service import EpisodeService
from app.services.rawlog_service import RawLogService
from app.services.session_service import SessionService
from app.services.turn_service import TurnService

router = APIRouter()

SEMANTIC_METADATA_FIELDS = (
    "user_goal",
    "context",
    "decision_or_insight",
    "emotional_or_situational_cue",
    "representative_snippets",
    "semantic_text",
)


def _build_service(db: Session) -> EpisodeService:
    session_service = SessionService(SessionRepository(db))
    rawlog_service = RawLogService(RawLogRepository(db), session_service)
    return EpisodeService(EpisodeRepository(db), rawlog_service)


def _build_turn_service(db: Session) -> TurnService:
    session_service = SessionService(SessionRepository(db))
    rawlog_service = RawLogService(RawLogRepository(db), session_service)
    return TurnService(TurnRepository(db), rawlog_service)


def _serialize_episode(episode_service: EpisodeService, episode: Episode) -> EpisodeRead:
    data = EpisodeRead.model_validate(episode)
    metadata = dict(data.metadata or {})
    metadata.pop("semantic_embedding", None)
    return data.model_copy(
        update={
            "rawlog_ids": episode_service.list_episode_rawlog_ids(episode.episode_id),
            "metadata": metadata or None,
        }
    )


def _episode_create_metadata(payload: EpisodeCreate) -> dict | None:
    metadata = dict(payload.metadata or {})
    for field in SEMANTIC_METADATA_FIELDS:
        value = getattr(payload, field)
        if isinstance(value, str) and value.strip():
            metadata[field] = value.strip()
        elif isinstance(value, list):
            cleaned = [str(entry).strip() for entry in value if str(entry).strip()]
            if cleaned:
                metadata[field] = cleaned
    return metadata or None


@router.post("", response_model=EpisodeRead, status_code=status.HTTP_201_CREATED)
def create_episode(payload: EpisodeCreate, db: Session = Depends(get_db)) -> EpisodeRead:
    episode_service = _build_service(db)
    try:
        episode = episode_service.create_episode(
            title=payload.title,
            summary=payload.summary,
            episode_type=payload.episode_type,
            rawlog_ids=payload.rawlog_ids,
            emotion_signal=payload.emotion_signal,
            importance_score=payload.importance_score,
            source_session_id=payload.source_session_id,
            keywords=payload.keywords,
            metadata=_episode_create_metadata(payload),
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return _serialize_episode(episode_service, episode)


@router.get("", response_model=list[EpisodeRead])
def list_episodes(
    limit: int = 50,
    source_session_id: str | None = None,
    db: Session = Depends(get_db),
) -> list[EpisodeRead]:
    episode_service = _build_service(db)
    episodes = episode_service.list_episodes(limit=limit, source_session_id=source_session_id)
    return [_serialize_episode(episode_service, episode) for episode in episodes]


@router.get("/{episode_id}", response_model=EpisodeRead)
def read_episode(episode_id: str, db: Session = Depends(get_db)) -> EpisodeRead:
    episode_service = _build_service(db)
    try:
        episode = episode_service.require_episode(episode_id)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return _serialize_episode(episode_service, episode)


@router.post("/build-from-session/{session_id}", response_model=list[EpisodeRead], status_code=status.HTTP_201_CREATED)
def build_episodes_from_session(
    session_id: str,
    payload: EpisodeBuildRequest | None = None,
    db: Session = Depends(get_db),
) -> list[EpisodeRead]:
    request = payload or EpisodeBuildRequest()
    episode_service = _build_service(db)
    turn_service = _build_turn_service(db)
    rawlog_service = turn_service.rawlog_service
    builder = EpisodeBuilderService(
        episode_service=episode_service,
        turn_service=turn_service,
        rawlog_service=rawlog_service,
        llm_client=LLMClient(),
    )

    try:
        episodes = builder.build_from_session(
            session_id=session_id,
            rebuild_existing=request.rebuild_existing,
        )
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    return [_serialize_episode(episode_service, episode) for episode in episodes]
