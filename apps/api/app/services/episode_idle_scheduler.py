import logging
import threading

from app.core.config import settings
from app.db.repositories.episode_repository import EpisodeRepository
from app.db.repositories.gist_repository import GistRepository
from app.db.repositories.long_term_memory_repository import LongTermMemoryRepository
from app.db.repositories.rawlog_repository import RawLogRepository
from app.db.repositories.session_repository import SessionRepository
from app.db.repositories.turn_repository import TurnRepository
from app.db.session import SessionLocal
from app.llm.client import LLMClient
from app.services.episode_builder_service import EpisodeBuilderService
from app.services.episode_service import EpisodeService
from app.services.gist_service import GistService
from app.services.memory_promotion_service import MemoryPromotionService
from app.services.rawlog_service import RawLogService
from app.services.session_service import SessionService
from app.services.turn_service import TurnService
from app.services.user_style_service import UserStyleService
from app.utils.datetime import utc_now

logger = logging.getLogger(__name__)


class EpisodeIdleScheduler:
    def __init__(self) -> None:
        self._timers: dict[str, threading.Timer] = {}
        self._tokens: dict[str, int] = {}
        self._status: dict[str, dict] = {}
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
            self._status[session_id] = {
                "session_id": session_id,
                "state": "scheduled",
                "attempts": 0,
                "scheduled_at": utc_now().isoformat(),
                "started_at": None,
                "finished_at": None,
                "last_error": None,
            }
            timer = threading.Timer(delay, self._run_if_latest, args=(session_id, token))
            timer.daemon = True
            self._timers[session_id] = timer
            timer.start()

    def _run_if_latest(self, session_id: str, token: int) -> None:
        with self._lock:
            if self._tokens.get(session_id) != token:
                return
            self._timers.pop(session_id, None)

        self._run_job(session_id=session_id, retry_on_failure=True)

    def retry_now(self, session_id: str) -> None:
        with self._lock:
            previous = self._timers.pop(session_id, None)
            if previous is not None:
                previous.cancel()
            token = self._tokens.get(session_id, 0) + 1
            self._tokens[session_id] = token
            self._status[session_id] = {
                **self._status.get(session_id, {"session_id": session_id, "attempts": 0}),
                "state": "scheduled",
                "scheduled_at": utc_now().isoformat(),
            }
        timer = threading.Timer(0, self._run_if_latest, args=(session_id, token))
        timer.daemon = True
        with self._lock:
            self._timers[session_id] = timer
        timer.start()

    def get_status(self, session_id: str) -> dict:
        with self._lock:
            status = self._status.get(session_id)
            if status is None:
                return {
                    "session_id": session_id,
                    "state": "idle",
                    "attempts": 0,
                    "scheduled_at": None,
                    "started_at": None,
                    "finished_at": None,
                    "last_error": None,
                }
            return dict(status)

    def _set_status(self, session_id: str, **updates) -> None:
        with self._lock:
            current = self._status.get(session_id, {"session_id": session_id, "attempts": 0})
            self._status[session_id] = {**current, **updates}

    def _run_job(self, session_id: str, retry_on_failure: bool) -> None:
        db = SessionLocal()
        attempts = int(self.get_status(session_id).get("attempts") or 0) + 1
        self._set_status(
            session_id,
            state="running",
            attempts=attempts,
            started_at=utc_now().isoformat(),
            finished_at=None,
            last_error=None,
        )
        try:
            llm_client = LLMClient()
            session_service = SessionService(SessionRepository(db))
            rawlog_service = RawLogService(RawLogRepository(db), session_service)
            turn_service = TurnService(TurnRepository(db), rawlog_service)
            episode_service = EpisodeService(EpisodeRepository(db), rawlog_service)
            gist_service = GistService(GistRepository(db), rawlog_service, turn_service, llm_client)

            gist_service.generate_for_session(session_id)
            db.commit()

            ltm_repository = LongTermMemoryRepository(db)
            memory_promotion_service = MemoryPromotionService(
                ltm_repository=ltm_repository,
                episode_service=episode_service,
            )
            builder = EpisodeBuilderService(
                episode_service=episode_service,
                turn_service=turn_service,
                rawlog_service=rawlog_service,
                llm_client=llm_client,
                gist_service=gist_service,
                memory_promotion_service=memory_promotion_service,
            )
            builder.build_from_session(session_id=session_id, rebuild_existing=True)
            db.commit()

            user_style_service = UserStyleService(
                ltm_repository=ltm_repository,
                rawlog_repository=RawLogRepository(db),
                llm_client=llm_client,
            )
            if user_style_service.should_update(session_id):
                user_style_service.analyze_and_update(session_id)
                db.commit()
            self._set_status(
                session_id,
                state="succeeded",
                finished_at=utc_now().isoformat(),
                last_error=None,
            )
        except Exception as exc:
            db.rollback()
            logger.exception("Episode idle job failed for session_id=%s", session_id)
            self._set_status(
                session_id,
                state="failed",
                finished_at=utc_now().isoformat(),
                last_error=str(exc),
            )
            if retry_on_failure and attempts < 2:
                logger.info("Retrying episode idle job for session_id=%s", session_id)
                self._set_status(session_id, state="retry_scheduled")
                timer = threading.Timer(5, self._run_job, kwargs={"session_id": session_id, "retry_on_failure": False})
                timer.daemon = True
                timer.start()
        finally:
            db.close()


episode_idle_scheduler = EpisodeIdleScheduler()
