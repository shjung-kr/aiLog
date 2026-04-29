import threading

from app.core.config import settings
from app.db.repositories.episode_repository import EpisodeRepository
from app.db.repositories.rawlog_repository import RawLogRepository
from app.db.repositories.session_repository import SessionRepository
from app.db.repositories.turn_repository import TurnRepository
from app.db.session import SessionLocal
from app.llm.client import LLMClient
from app.services.episode_builder_service import EpisodeBuilderService
from app.services.episode_service import EpisodeService
from app.services.rawlog_service import RawLogService
from app.services.session_service import SessionService
from app.services.turn_service import TurnService


class EpisodeIdleScheduler:
    def __init__(self) -> None:
        self._timers: dict[str, threading.Timer] = {}
        self._tokens: dict[str, int] = {}
        self._lock = threading.Lock()

    def schedule(self, session_id: str) -> None:
        delay = settings.episode_idle_seconds
        if delay <= 0:
            return

        with self._lock:
            previous = self._timers.pop(session_id, None)
            if previous is not None:
                previous.cancel()

            token = self._tokens.get(session_id, 0) + 1
            self._tokens[session_id] = token
            timer = threading.Timer(delay, self._run_if_latest, args=(session_id, token))
            timer.daemon = True
            self._timers[session_id] = timer
            timer.start()

    def _run_if_latest(self, session_id: str, token: int) -> None:
        with self._lock:
            if self._tokens.get(session_id) != token:
                return
            self._timers.pop(session_id, None)

        db = SessionLocal()
        try:
            session_service = SessionService(SessionRepository(db))
            rawlog_service = RawLogService(RawLogRepository(db), session_service)
            turn_service = TurnService(TurnRepository(db), rawlog_service)
            episode_service = EpisodeService(EpisodeRepository(db), rawlog_service)
            builder = EpisodeBuilderService(
                episode_service=episode_service,
                turn_service=turn_service,
                rawlog_service=rawlog_service,
                llm_client=LLMClient(),
            )
            builder.build_from_session(session_id=session_id, rebuild_existing=True)
            db.commit()
        except Exception:
            db.rollback()
        finally:
            db.close()


episode_idle_scheduler = EpisodeIdleScheduler()
