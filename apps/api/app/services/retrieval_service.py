import re
from math import sqrt

# Phrases that indicate a memory-recall question rather than a content query.
# We strip these so the embedding focuses on the actual topic, not the meta-framing.
# Words stripped from memory-recall queries so the embedding targets the topic, not the meta-framing.
_MEMORY_META_RE = re.compile(
    r"(기억\s*하니[?]?|기억\s*해[?]?|기억\s*나니[?]?|기억\s*나[?]?|"
    r"이야기\s*했던\s*것[을]?|이야기\s*했던[가]?|얘기\s*했던\s*것[을]?|"
    r"얘기\s*했던[가]?|대화\s*했던|이야기\s*한\s*적|얘기\s*한\s*적|"
    r"했던\s*거\s*기억|했던\s*적\s*있[니]?|너와\s*이야기|우리가\s*이야기|"
    r"에\s*대해서|에\s*대해|에\s*관해서|에\s*관해|[?？!~])",
    re.IGNORECASE,
)

# Episodes whose semantic_text is primarily about a FAILED memory recall attempt carry no
# useful content — they only record that recall didn't work, which is noise for retrieval.
_FAILED_RECALL_RE = re.compile(
    r"(자동으로\s*불러오[진]?\s*못|세부를\s*(바로\s*)?(복원|확인)\s*(하기|하지)\s*(어렵|못)|"
    r"억지로\s*(과거|이전)\s*(내용|기억|맥락)을?\s*(끌어|복원)|"
    r"확답은?\s*피했|확답\s*하기\s*(어렵|힘들)|"
    r"(이전|과거)\s*(대화|내용|기억)을?\s*(직접|바로)\s*(확인|복원)\s*(불가|안\s*됨|할\s*수\s*없)|"
    r"기억\s*(검증|확인)에\s*매달|기억\s*여부를\s*캐묻)",
    re.DOTALL,
)
META_RECALL_PENALTY = 0.12

from app.db.models.episode import Episode
from app.db.models.search_log import SearchLog
from app.db.repositories.episode_repository import EpisodeRepository
from app.db.repositories.search_repository import SearchRepository
from app.llm.client import LLMClient
from app.services.rawlog_service import RawLogService
from app.utils.datetime import utc_now
from app.utils.ids import new_id

EMBEDDING_METADATA_KEY = "semantic_embedding"
TITLE_EMBEDDING_METADATA_KEY = "title_embedding"
SEMANTIC_TEXT_METADATA_KEY = "semantic_text"
RETRIEVAL_SCORE_THRESHOLD = 0.35
RETRIEVAL_CANDIDATE_LIMIT = 12
KEYWORD_BOOST_WEIGHT = 0.15  # hybrid: 85% embedding + 15% keyword overlap


class RetrievalService:
    def __init__(
        self,
        episode_repository: EpisodeRepository,
        rawlog_service: RawLogService,
        llm_client: LLMClient,
        search_repository: SearchRepository | None = None,
    ) -> None:
        self.episode_repository = episode_repository
        self.rawlog_service = rawlog_service
        self.llm_client = llm_client
        self.search_repository = search_repository

    def retrieve_for_query(
        self,
        query: str,
        session_id: str | None = None,
        recent_turns: list[str] | None = None,
    ) -> tuple[str | None, list[dict]]:
        query = query.strip()
        if not query:
            return None, []

        # Step 1: embed enriched query (current message + recent context for follow-ups)
        embedding_query = self._build_embedding_query(query, recent_turns)
        query_embedding = self.llm_client.embed_texts([embedding_query])[0]
        query_tokens = self._tokenize(query)
        candidates: list[tuple[float, Episode]] = []
        for episode in self.episode_repository.list_all(limit=500):
            metadata = episode.metadata_json or {}
            embedding = metadata.get(EMBEDDING_METADATA_KEY)
            if not isinstance(embedding, list):
                continue
            cosine = self._cosine_similarity(query_embedding, [float(v) for v in embedding])
            title_embedding = metadata.get(TITLE_EMBEDDING_METADATA_KEY)
            if isinstance(title_embedding, list):
                cosine_title = self._cosine_similarity(query_embedding, [float(v) for v in title_embedding])
                cosine = max(cosine, cosine_title)
            semantic_text = metadata.get(SEMANTIC_TEXT_METADATA_KEY, "") or ""
            keyword_score = self._keyword_overlap(query_tokens, semantic_text)
            score = cosine * (1 - KEYWORD_BOOST_WEIGHT) + keyword_score * KEYWORD_BOOST_WEIGHT
            # Penalise episodes that only record a failed recall attempt — they add noise.
            if _FAILED_RECALL_RE.search(semantic_text[:300]):
                score -= META_RECALL_PENALTY
            if score >= RETRIEVAL_SCORE_THRESHOLD:
                candidates.append((score, episode))

        ranked = sorted(candidates, key=lambda item: item[0], reverse=True)[:RETRIEVAL_CANDIDATE_LIMIT]
        retrieved_log = [
            {"episode_id": ep.episode_id, "title": ep.title, "score": round(sc, 4)}
            for sc, ep in ranked
        ]

        if not ranked:
            self._log(
                query=query,
                session_id=session_id,
                retrieved=retrieved_log,
                curated=[],
                used_episode_id=None,
                reasoning="no candidates above threshold",
            )
            return None, []

        # Step 2: curator — filter with original query + conversation context
        curator_input = [
            {
                "episode_id": ep.episode_id,
                "semantic_text": self._episode_semantic_text(ep),
                "score": round(sc, 4),
            }
            for sc, ep in ranked
        ]
        relevant_ids, reasoning = self.llm_client.curate_episodes(
            query, curator_input, conversation_context=recent_turns
        )
        relevant_set = set(relevant_ids)

        curated = [(sc, ep) for sc, ep in ranked if ep.episode_id in relevant_set]
        curated_log = [
            {"episode_id": ep.episode_id, "title": ep.title, "score": round(sc, 4)}
            for sc, ep in curated
        ]

        if not curated:
            self._log(
                query=query,
                session_id=session_id,
                retrieved=retrieved_log,
                curated=curated_log,
                used_episode_id=None,
                reasoning=reasoning,
            )
            return None, []

        # Step 3: take only the single best episode (spec: 1턴에 한 episode만 활용)
        best_score, best_episode = curated[0]
        semantic_text = self._episode_semantic_text(best_episode)

        self._log(
            query=query,
            session_id=session_id,
            retrieved=retrieved_log,
            curated=curated_log,
            used_episode_id=best_episode.episode_id,
            reasoning=reasoning,
        )

        context_items = [
            {
                "episode_id": best_episode.episode_id,
                "title": best_episode.title,
                "score": round(best_score, 4),
                "rawlog_ids": [],
            }
        ]
        return semantic_text, context_items

    def _build_embedding_query(self, query: str, recent_turns: list[str] | None) -> str:
        # For memory-recall questions the raw query is dominated by meta-words like
        # "기억하니", "이야기 했던것" which pull the embedding away from the actual topic.
        # Strip those so the vector is anchored on what the user actually wants to recall.
        topic = _MEMORY_META_RE.sub(" ", query)
        topic = re.sub(r"\s+", " ", topic).strip()
        # Use topic-focused query when stripping made a meaningful difference;
        # otherwise fall back to the original.
        embedding_text = topic if len(topic) >= 2 and len(topic) < len(query) else query

        if not recent_turns:
            return embedding_text
        context = "\n".join(recent_turns[-4:])
        return f"{context}\nuser: {embedding_text}"

    def _episode_semantic_text(self, episode: Episode) -> str:
        metadata = episode.metadata_json or {}
        semantic_text = metadata.get(SEMANTIC_TEXT_METADATA_KEY)
        if isinstance(semantic_text, str) and semantic_text.strip():
            return semantic_text.strip()
        # fallback: compose from display fields
        parts = [f"{episode.title}: {episode.summary}"]
        if episode.keywords:
            parts.append(", ".join(episode.keywords))
        return " | ".join(parts)

    def _log(
        self,
        query: str,
        session_id: str | None,
        retrieved: list[dict],
        curated: list[dict],
        used_episode_id: str | None,
        reasoning: str,
    ) -> None:
        if self.search_repository is None:
            return
        try:
            log = SearchLog(
                log_id=new_id(),
                query=query,
                session_id=session_id,
                retrieved_json=retrieved,
                curated_json=curated,
                used_episode_id=used_episode_id,
                curator_reasoning=reasoning or None,
                created_at=utc_now(),
            )
            self.search_repository.create(log)
        except Exception:
            pass

    def _tokenize(self, text: str) -> set[str]:
        return {t for t in re.findall(r"[0-9A-Za-z가-힣]{2,}", text.lower()) if len(t) >= 2}

    def _keyword_overlap(self, query_tokens: set[str], text: str) -> float:
        if not query_tokens or not text:
            return 0.0
        text_tokens = self._tokenize(text)
        if not text_tokens:
            return 0.0
        matched = query_tokens & text_tokens
        return len(matched) / len(query_tokens)

    def _cosine_similarity(self, left: list[float], right: list[float]) -> float:
        if not left or not right or len(left) != len(right):
            return 0.0
        dot = sum(lv * rv for lv, rv in zip(left, right))
        left_norm = sqrt(sum(v * v for v in left))
        right_norm = sqrt(sum(v * v for v in right))
        if left_norm == 0 or right_norm == 0:
            return 0.0
        return dot / (left_norm * right_norm)
