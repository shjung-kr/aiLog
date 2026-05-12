import re
from math import sqrt

from app.db.models.episode import Episode
from app.llm.client import LLMClient
from app.pipeline.episode.episode_builder import (
    EMBEDDING_SOURCE_VERSION,
    EMBEDDING_SOURCE_VERSION_METADATA_KEY,
    SEMANTIC_TEXT_METADATA_KEY,
    EpisodeBuilder,
)
from app.services.episode_service import EpisodeService
from app.services.gist_service import GistService
from app.services.rawlog_service import RawLogService
from app.services.turn_service import TurnService

EMBEDDING_MERGE_THRESHOLD = 0.74
MIN_EMBEDDING_COSINE_FOR_MERGE = 0.68
FALLBACK_MERGE_SIMILARITY_THRESHOLD = 0.16
EMBEDDING_METADATA_KEY = "semantic_embedding"
EMBEDDING_MODEL_METADATA_KEY = "semantic_embedding_model"
STOPWORDS = {
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
}

TERM_ALIASES = {
    "episode": "에피소드",
    "episodes": "에피소드",
    "episode_id": "에피소드",
    "episode_type": "에피소드",
    "rawlog": "rawlog",
    "rawlogs": "rawlog",
    "session": "세션",
    "sessions": "세션",
    "source_session_id": "세션",
    "schema": "스키마",
    "metadata": "메타데이터",
}

DOMAIN_TERMS = {"에피소드", "rawlog", "세션", "스키마", "기억구조", "의미", "분류"}


class EpisodeBuilderService:
    def __init__(
        self,
        episode_service: EpisodeService,
        turn_service: TurnService,
        rawlog_service: RawLogService,
        llm_client: LLMClient,
        gist_service: GistService | None = None,
    ) -> None:
        self.episode_service = episode_service
        self.turn_service = turn_service
        self.rawlog_service = rawlog_service
        self.llm_client = llm_client
        self.gist_service = gist_service
        self.episode_builder = EpisodeBuilder(llm_client)
        self._last_match_score = 0.0
        self._last_match_method: str | None = None

    def build_from_session(self, session_id: str, rebuild_existing: bool = True) -> list[Episode]:
        gists = self.gist_service.list_for_session(session_id) if self.gist_service else []

        if gists:
            valid_rawlog_ids: set[str] = set()
            gist_segments: list[dict] = []
            for gist in gists:
                rawlog_ids = (gist.metadata_json or {}).get("rawlog_ids", [])
                valid_rawlog_ids.update(rawlog_ids)
                gist_segments.append({
                    "gist_id": gist.gist_id,
                    "gist_text": gist.gist_text,
                    "topic": gist.topic,
                    "intent": gist.intent,
                    "rawlog_ids": rawlog_ids,
                })

            if rebuild_existing:
                self.episode_service.clear_session_episodes(session_id)

            built_episodes = self.episode_builder.build_from_gists(
                gist_segments=gist_segments,
                valid_rawlog_ids=valid_rawlog_ids,
            )
        else:
            turns = self.turn_service.build_from_session(session_id)
            rawlogs = self.rawlog_service.list_session_rawlogs(session_id)
            rawlog_by_id = {rawlog.rawlog_id: rawlog for rawlog in rawlogs}

            llm_turns = []
            for turn in turns:
                start = rawlog_by_id[turn.start_rawlog_id].sequence_no
                end = rawlog_by_id[turn.end_rawlog_id].sequence_no
                turn_rawlogs = [rawlog for rawlog in rawlogs if start <= rawlog.sequence_no <= end]
                llm_turns.append({
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
                })

            if not llm_turns:
                return []

            if rebuild_existing:
                self.episode_service.clear_session_episodes(session_id)

            valid_rawlog_ids = {rawlog.rawlog_id for rawlog in rawlogs}
            built_episodes = self.episode_builder.build(llm_turns=llm_turns, valid_rawlog_ids=valid_rawlog_ids)
        episodes: list[Episode] = []
        existing_episodes = self.episode_service.list_all_episodes(limit=300)
        for item in built_episodes:
            matching_episode = self._find_matching_episode(
                existing_episodes=existing_episodes,
                title=item.title,
                summary=item.summary,
                episode_type=item.episode_type,
                keywords=item.keywords,
                semantic_text=item.semantic_text,
            )
            if matching_episode is None:
                episode = self.episode_service.create_episode(
                    title=item.title,
                    summary=item.summary,
                    episode_type=item.episode_type,
                    rawlog_ids=item.rawlog_ids,
                    emotion_signal=item.emotion_signal,
                    importance_score=item.importance_score,
                    source_session_id=session_id,
                    keywords=item.keywords,
                    metadata={
                        "builder": "llm_episode_builder_v1",
                        "episode_scope": "cross_session_semantic",
                        **item.metadata,
                    },
                )
                self._store_episode_embedding(episode)
                existing_episodes.append(episode)
            else:
                old_semantic_text = self._episode_semantic_text(matching_episode)
                episode = self.episode_service.merge_episode(
                    episode=matching_episode,
                    title=item.title,
                    summary=item.summary,
                    episode_type=item.episode_type,
                    rawlog_ids=item.rawlog_ids,
                    emotion_signal=item.emotion_signal,
                    importance_score=item.importance_score,
                    keywords=item.keywords,
                    metadata={
                        "builder": "llm_episode_builder_v1",
                        "episode_scope": "cross_session_semantic",
                        "merge_similarity": self._last_match_score,
                        "merge_similarity_method": self._last_match_method,
                        **item.metadata,
                    },
                )
                merged_semantic_text = self._merged_semantic_text(old_semantic_text, item.semantic_text)
                episode.metadata_json = {
                    **(episode.metadata_json or {}),
                    SEMANTIC_TEXT_METADATA_KEY: merged_semantic_text,
                }
                self.episode_service.update_episode(episode)
                self._store_episode_embedding(episode)
            episodes.append(episode)

        return episodes

    def _merged_semantic_text(self, old_text: str, new_text: str) -> str:
        if not old_text.strip():
            return new_text
        if not new_text.strip():
            return old_text
        try:
            return self.llm_client.merge_semantic_text(old_text, new_text)
        except Exception:
            return new_text

    def _find_matching_episode(
        self,
        existing_episodes: list[Episode],
        title: str,
        summary: str,
        episode_type: str,
        keywords: list[str] | None,
        semantic_text: str,
    ) -> Episode | None:
        self._last_match_score = 0.0
        self._last_match_method = None
        try:
            candidate_embedding = self.llm_client.embed_texts([semantic_text])[0]
            best_episode = None
            best_score = 0.0
            for episode in existing_episodes:
                episode_embedding = self._ensure_episode_embedding(episode)
                cosine_score = self._cosine_similarity(candidate_embedding, episode_embedding)
                if cosine_score < MIN_EMBEDDING_COSINE_FOR_MERGE:
                    continue
                score = self._merge_score(
                    embedding_cosine=cosine_score,
                    left_keywords=episode.keywords,
                    right_keywords=keywords,
                    left_episode_type=episode.episode_type,
                    right_episode_type=episode_type,
                )
                if score > best_score:
                    best_score = score
                    best_episode = episode

            self._last_match_score = best_score
            self._last_match_method = "semantic_embedding_hybrid"
            if best_score < EMBEDDING_MERGE_THRESHOLD:
                return None
            return best_episode
        except Exception:
            return self._find_matching_episode_by_metadata(
                existing_episodes=existing_episodes,
                title=title,
                summary=summary,
                keywords=keywords,
            )

    def _find_matching_episode_by_metadata(
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

        self._last_match_score = best_score
        self._last_match_method = "metadata_fallback"
        if best_score < FALLBACK_MERGE_SIMILARITY_THRESHOLD:
            return None
        return best_episode

    def _store_episode_embedding(self, episode: Episode) -> None:
        text = self._episode_semantic_text(episode)
        embedding = self.llm_client.embed_texts([text])[0]
        episode.metadata_json = {
            **(episode.metadata_json or {}),
            SEMANTIC_TEXT_METADATA_KEY: text,
            EMBEDDING_METADATA_KEY: embedding,
            EMBEDDING_MODEL_METADATA_KEY: getattr(self.llm_client, "embedding_model", None),
            EMBEDDING_SOURCE_VERSION_METADATA_KEY: EMBEDDING_SOURCE_VERSION,
        }
        self.episode_service.update_episode(episode)

    def _ensure_episode_embedding(self, episode: Episode) -> list[float]:
        metadata = episode.metadata_json or {}
        embedding = metadata.get(EMBEDDING_METADATA_KEY)
        semantic_text = self._episode_semantic_text(episode)
        if (
            isinstance(embedding, list)
            and metadata.get(SEMANTIC_TEXT_METADATA_KEY) == semantic_text
            and metadata.get(EMBEDDING_SOURCE_VERSION_METADATA_KEY) == EMBEDDING_SOURCE_VERSION
        ):
            return [float(value) for value in embedding]

        embedding = self.llm_client.embed_texts([semantic_text])[0]
        episode.metadata_json = {
            **metadata,
            SEMANTIC_TEXT_METADATA_KEY: semantic_text,
            EMBEDDING_METADATA_KEY: embedding,
            EMBEDDING_MODEL_METADATA_KEY: getattr(self.llm_client, "embedding_model", None),
            EMBEDDING_SOURCE_VERSION_METADATA_KEY: EMBEDDING_SOURCE_VERSION,
        }
        self.episode_service.update_episode(episode)
        return embedding

    def _episode_semantic_text(self, episode: Episode) -> str:
        metadata = episode.metadata_json or {}
        semantic_text = metadata.get(SEMANTIC_TEXT_METADATA_KEY)
        if isinstance(semantic_text, str) and semantic_text.strip():
            return semantic_text.strip()
        return self._semantic_text(title=episode.title, summary=episode.summary, keywords=episode.keywords)

    def _semantic_text(self, title: str, summary: str, keywords: list[str] | None) -> str:
        keyword_text = ", ".join(str(keyword) for keyword in keywords or [])
        return "\n".join(
            [
                f"Title: {title.strip()}",
                f"Summary: {summary.strip()}",
                f"Keywords: {keyword_text}",
            ]
        )

    def _cosine_similarity(self, left: list[float], right: list[float]) -> float:
        if not left or not right or len(left) != len(right):
            return 0.0
        dot = sum(left_value * right_value for left_value, right_value in zip(left, right))
        left_norm = sqrt(sum(value * value for value in left))
        right_norm = sqrt(sum(value * value for value in right))
        if left_norm == 0 or right_norm == 0:
            return 0.0
        return dot / (left_norm * right_norm)

    def _merge_score(
        self,
        embedding_cosine: float,
        left_keywords: list[str] | None,
        right_keywords: list[str] | None,
        left_episode_type: str,
        right_episode_type: str,
    ) -> float:
        keyword_score = self._jaccard(self._keyword_set(left_keywords), self._keyword_set(right_keywords))
        type_score = 1.0 if left_episode_type.strip() == right_episode_type.strip() else 0.0
        return (embedding_cosine * 0.8) + (keyword_score * 0.1) + (type_score * 0.1)

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
        domain_score = self._domain_score(
            left_keywords_set | left_terms,
            right_keywords_set | right_terms,
        )

        return (keyword_score * 0.4) + (term_score * 0.25) + (gram_score * 0.15) + (domain_score * 0.2)

    def _keyword_set(self, keywords: list[str] | None) -> set[str]:
        return {self._normalize_term(str(keyword)) for keyword in keywords or [] if str(keyword).strip()}

    def _term_set(self, text: str) -> set[str]:
        terms = set(re.findall(r"[0-9A-Za-z가-힣_]{2,}", text.lower()))
        return {self._normalize_term(term) for term in terms if self._normalize_term(term) not in STOPWORDS}

    def _char_grams(self, text: str) -> set[str]:
        normalized = re.sub(r"\s+", "", text.lower())
        return {normalized[index : index + 3] for index in range(max(len(normalized) - 2, 0))}

    def _jaccard(self, left: set[str], right: set[str]) -> float:
        if not left or not right:
            return 0.0
        return len(left & right) / len(left | right)

    def _domain_score(self, left: set[str], right: set[str]) -> float:
        shared_domain_terms = (left & right) & DOMAIN_TERMS
        if not shared_domain_terms:
            return 0.0
        return min(1.0, len(shared_domain_terms) / 2)

    def _normalize_term(self, term: str) -> str:
        normalized = term.lower().strip()
        return TERM_ALIASES.get(normalized, normalized)
