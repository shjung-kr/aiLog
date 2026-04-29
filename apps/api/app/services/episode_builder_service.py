import re

from app.db.models.episode import Episode
from app.llm.client import LLMClient
from app.services.episode_service import EpisodeService
from app.services.rawlog_service import RawLogService
from app.services.turn_service import TurnService

MERGE_SIMILARITY_THRESHOLD = 0.22
STOPWORDS = {
    "episode",
    "rawlog",
    "session",
    "turn",
    "사용자",
    "대화",
    "내용",
    "관련",
    "정보",
    "요청",
    "논의",
    "정리",
    "확인",
    "설명",
    "에피소드",
    "세션",
}


class EpisodeBuilderService:
    def __init__(
        self,
        episode_service: EpisodeService,
        turn_service: TurnService,
        rawlog_service: RawLogService,
        llm_client: LLMClient,
    ) -> None:
        self.episode_service = episode_service
        self.turn_service = turn_service
        self.rawlog_service = rawlog_service
        self.llm_client = llm_client

    def build_from_session(self, session_id: str, rebuild_existing: bool = True) -> list[Episode]:
        turns = self.turn_service.build_from_session(session_id)
        rawlogs = self.rawlog_service.list_session_rawlogs(session_id)
        rawlog_by_id = {rawlog.rawlog_id: rawlog for rawlog in rawlogs}

        llm_turns = []
        for turn in turns:
            start = rawlog_by_id[turn.start_rawlog_id].sequence_no
            end = rawlog_by_id[turn.end_rawlog_id].sequence_no
            turn_rawlogs = [rawlog for rawlog in rawlogs if start <= rawlog.sequence_no <= end]
            llm_turns.append(
                {
                    "turn_id": turn.turn_id,
                    "rawlogs": [
                        {
                            "rawlog_id": rawlog.rawlog_id,
                            "sequence_no": rawlog.sequence_no,
                            "speaker_type": rawlog.speaker_type,
                            "content": rawlog.content,
                        }
                        for rawlog in turn_rawlogs
                    ],
                }
            )

        if not llm_turns:
            return []

        if rebuild_existing:
            self.episode_service.clear_session_episodes(session_id)

        valid_rawlog_ids = {rawlog.rawlog_id for rawlog in rawlogs}
        built_episodes = self.llm_client.build_episodes(llm_turns)
        episodes: list[Episode] = []
        existing_episodes = self.episode_service.list_all_episodes(limit=300)
        for item in built_episodes:
            rawlog_ids = [rawlog_id for rawlog_id in item.get("rawlog_ids", []) if rawlog_id in valid_rawlog_ids]
            if not rawlog_ids:
                continue
            title = str(item.get("title") or "Untitled episode")
            summary = str(item.get("summary") or "Semantic episode generated from conversation turns.")
            episode_type = str(item.get("episode_type") or "topic")
            keywords = item.get("keywords") if isinstance(item.get("keywords"), list) else None
            matching_episode = self._find_matching_episode(
                existing_episodes=existing_episodes,
                title=title,
                summary=summary,
                keywords=keywords,
            )
            if matching_episode is None:
                episode = self.episode_service.create_episode(
                    title=title,
                    summary=summary,
                    episode_type=episode_type,
                    rawlog_ids=rawlog_ids,
                    emotion_signal=item.get("emotion_signal"),
                    importance_score=item.get("importance_score"),
                    source_session_id=session_id,
                    keywords=keywords,
                    metadata={
                        "builder": "llm_episode_builder_v1",
                        "episode_scope": "cross_session_semantic",
                    },
                )
                existing_episodes.append(episode)
            else:
                episode = self.episode_service.merge_episode(
                    episode=matching_episode,
                    title=title,
                    summary=summary,
                    episode_type=episode_type,
                    rawlog_ids=rawlog_ids,
                    emotion_signal=item.get("emotion_signal"),
                    importance_score=item.get("importance_score"),
                    keywords=keywords,
                    metadata={
                        "builder": "llm_episode_builder_v1",
                        "episode_scope": "cross_session_semantic",
                        "merge_similarity": self._episode_similarity(
                            matching_episode.title,
                            matching_episode.summary,
                            matching_episode.keywords,
                            title,
                            summary,
                            keywords,
                        ),
                    },
                )
            episodes.append(episode)

        return episodes

    def _find_matching_episode(
        self,
        existing_episodes: list[Episode],
        title: str,
        summary: str,
        keywords: list[str] | None,
    ) -> Episode | None:
        best_episode = None
        best_score = 0.0
        for episode in existing_episodes:
            score = self._episode_similarity(
                episode.title,
                episode.summary,
                episode.keywords,
                title,
                summary,
                keywords,
            )
            if score > best_score:
                best_score = score
                best_episode = episode

        if best_score < MERGE_SIMILARITY_THRESHOLD:
            return None
        return best_episode

    def _episode_similarity(
        self,
        left_title: str,
        left_summary: str,
        left_keywords: list[str] | None,
        right_title: str,
        right_summary: str,
        right_keywords: list[str] | None,
    ) -> float:
        left_keywords_set = self._keyword_set(left_keywords)
        right_keywords_set = self._keyword_set(right_keywords)
        keyword_score = self._jaccard(left_keywords_set, right_keywords_set)

        left_terms = self._term_set(f"{left_title} {left_summary}")
        right_terms = self._term_set(f"{right_title} {right_summary}")
        term_score = self._jaccard(left_terms, right_terms)

        left_grams = self._char_grams(f"{left_title} {left_summary}")
        right_grams = self._char_grams(f"{right_title} {right_summary}")
        gram_score = self._jaccard(left_grams, right_grams)

        return (keyword_score * 0.5) + (term_score * 0.3) + (gram_score * 0.2)

    def _keyword_set(self, keywords: list[str] | None) -> set[str]:
        return {str(keyword).lower().strip() for keyword in keywords or [] if str(keyword).strip()}

    def _term_set(self, text: str) -> set[str]:
        terms = set(re.findall(r"[0-9A-Za-z가-힣_]{2,}", text.lower()))
        return {term for term in terms if term not in STOPWORDS}

    def _char_grams(self, text: str) -> set[str]:
        normalized = re.sub(r"\s+", "", text.lower())
        return {normalized[index : index + 3] for index in range(max(len(normalized) - 2, 0))}

    def _jaccard(self, left: set[str], right: set[str]) -> float:
        if not left or not right:
            return 0.0
        return len(left & right) / len(left | right)
