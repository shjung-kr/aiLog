import logging

from app.core.config import settings
from app.db.models.gist import Gist

logger = logging.getLogger(__name__)
from app.db.repositories.gist_repository import GistRepository
from app.llm.client import LLMClient
from app.pipeline.gist.gist_generator import GistGenerator
from app.pipeline.gist.gist_validator import GistValidator
from app.pipeline.segmentation.segmenter import Segmenter
from app.services.rawlog_service import RawLogService
from app.services.turn_service import TurnService
from app.utils.datetime import utc_now
from app.utils.ids import new_id


class GistService:
    def __init__(
        self,
        gist_repository: GistRepository,
        rawlog_service: RawLogService,
        turn_service: TurnService,
        llm_client: LLMClient,
    ) -> None:
        self.gist_repository = gist_repository
        self.rawlog_service = rawlog_service
        self.turn_service = turn_service
        self.llm_client = llm_client
        self.segmenter = Segmenter(max_turns_per_segment=settings.gist_max_segment_size)
        self.generator = GistGenerator(llm_client)
        self.validator = GistValidator()

    def generate_for_session(self, session_id: str) -> list[Gist]:
        self.gist_repository.delete_by_session_id(session_id)

        rawlogs = self.rawlog_service.list_session_rawlogs(session_id)
        if not rawlogs:
            return []

        rawlog_by_id = {r.rawlog_id: r for r in rawlogs}
        turns = self.turn_service.build_from_session(session_id)
        if not turns:
            return []

        turn_dicts = []
        for turn in turns:
            start_seq = rawlog_by_id[turn.start_rawlog_id].sequence_no
            end_seq = rawlog_by_id[turn.end_rawlog_id].sequence_no
            turn_rawlogs = [r for r in rawlogs if start_seq <= r.sequence_no <= end_seq]
            turn_dicts.append({
                "turn_id": turn.turn_id,
                "rawlog_ids": [r.rawlog_id for r in turn_rawlogs],
                "rawlogs": [
                    {
                        "rawlog_id": r.rawlog_id,
                        "speaker_type": r.speaker_type,
                        "content": r.content,
                    }
                    for r in turn_rawlogs
                ],
            })

        segments = self._segment_turns(turn_dicts)
        logger.info("[gist] session=%s turns=%d segments=%d", session_id, len(turn_dicts), len(segments))

        gist_datas = self.generator.generate_batch(segments)

        gists: list[Gist] = []
        failed = 0
        for segment, gist_data in zip(segments, gist_datas):
            if not self.validator.is_valid(gist_data):
                failed += 1
                continue

            rawlog_ids: list[str] = []
            for turn in segment:
                rawlog_ids.extend(turn["rawlog_ids"])

            if not rawlog_ids:
                continue

            gist = Gist(
                gist_id=new_id(),
                start_rawlog_id=rawlog_ids[0],
                end_rawlog_id=rawlog_ids[-1],
                title=str(gist_data.get("title") or "").strip()[:255],
                gist_text=str(gist_data.get("gist_text") or "").strip(),
                topic=str(gist_data.get("topic") or "").strip()[:255] or None,
                intent=str(gist_data.get("intent") or "").strip()[:255] or None,
                created_at=utc_now(),
                confidence=(
                    float(gist_data["confidence"])
                    if isinstance(gist_data.get("confidence"), (int, float))
                    else None
                ),
                metadata_json={"rawlog_ids": rawlog_ids},
            )
            gists.append(gist)

        logger.info("[gist] session=%s gists_created=%d gists_failed=%d", session_id, len(gists), failed)

        if not gists:
            return []

        return self.gist_repository.create_many(gists)

    def _segment_turns(self, turn_dicts: list[dict]) -> list[list[dict]]:
        turn_texts = [
            " ".join(r["content"] for r in turn.get("rawlogs", []))
            for turn in turn_dicts
        ]
        try:
            embeddings = self.llm_client.embed_texts(turn_texts)
            segments = self.segmenter.segment_with_boundaries(
                turn_dicts,
                embeddings,
                threshold=settings.gist_boundary_threshold,
            )
            logger.debug("[gist:segment] method=boundary_detector threshold=%.2f", settings.gist_boundary_threshold)
            return segments
        except Exception:
            logger.warning("[gist:segment] boundary detection failed, falling back to fixed window")
            return self.segmenter.segment(turn_dicts)

    def list_for_session(self, session_id: str) -> list[Gist]:
        return self.gist_repository.list_by_session_id(session_id)
