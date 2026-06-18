"""
E2E Benchmark for aiLog — pipeline quality + latency

Usage:
  python benchmarks/e2e_benchmark.py [--api-url URL] [--api-key KEY] [--case NAME]
  python benchmarks/e2e_benchmark.py --json results.json

What it measures
  Episode build quality
    - keyword_coverage  : fraction of expected_keywords present in episode text
    - semantic_text_len : character count of generated semantic_text
    - has_insight       : episode has decision_or_insight field (content richness)

  Retrieval quality
    - retrieval_score   : cosine similarity score from vector search (0–1)
    - text_coverage     : fraction of expected_keywords in returned semantic_text
    - retrieved_title   : the episode title that was surfaced

  Hit metrics
    - hit@1             : top result is from the seeded session
    - any_hit           : at least one result is from the seeded session

  Latency
    - seed_ms, build_ms, retrieval_ms per phase
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[3] / ".env")


class _Cfg:
    api_url: str = os.getenv("BENCHMARK_API_URL", "http://127.0.0.1:8000")
    api_key: str = os.getenv("AILOG_ADMIN_API_KEY", "")

cfg = _Cfg()


@dataclass
class TestCase:
    name: str
    seed_messages: list[str]
    recall_query: str
    expected_keywords: list[str]


@dataclass
class EpisodeQuality:
    episode_id: str = ""
    title: str = ""
    keywords: list[str] = field(default_factory=list)
    semantic_text: str = ""
    keyword_coverage: float = 0.0   # fraction of expected_keywords found in episode
    has_insight: bool = False        # has decision_or_insight field


@dataclass
class RetrievalQuality:
    score: float = 0.0              # vector similarity score from the API
    retrieved_title: str = ""
    semantic_text: str = ""
    text_coverage: float = 0.0      # fraction of expected_keywords in returned semantic_text
    no_result: bool = False         # retrieval returned nothing


@dataclass
class CaseResult:
    name: str
    hit_at_1: bool = False
    any_hit: bool = False
    episode: EpisodeQuality = field(default_factory=EpisodeQuality)
    retrieval: RetrievalQuality = field(default_factory=RetrievalQuality)
    seed_ms: float = 0.0
    build_ms: float = 0.0
    retrieval_ms: float = 0.0
    error: str | None = None


TEST_CASES: list[TestCase] = [
    TestCase(
        name="파이썬_asyncio",
        seed_messages=[
            "파이썬에서 asyncio를 사용해 비동기 HTTP 요청을 처리하는 방법을 알려줘.",
            "aiohttp와 httpx 중에서 어떤 걸 쓰는 게 더 좋을까? 성능 차이도 알려줘.",
        ],
        recall_query="지난번에 이야기했던 파이썬 비동기 라이브러리 비교 내용이 뭐였지?",
        expected_keywords=["asyncio", "비동기", "aiohttp", "httpx"],
    ),
    TestCase(
        name="제주도_여행",
        seed_messages=[
            "제주도 여행 3박 4일 추천 코스를 자세하게 짜줘. 동쪽과 서쪽 각각 추천해줘.",
            "제주 올레길 중에서 초보자가 걷기 좋은 코스는 어디야?",
        ],
        recall_query="예전에 물어봤던 제주도 여행 코스 뭐였더라?",
        expected_keywords=["제주", "여행", "올레"],
    ),
    TestCase(
        name="김치찌개_레시피",
        seed_messages=[
            "김치찌개 황금 레시피를 알려줘. 돼지고기 들어가는 버전으로.",
            "김치찌개 끓일 때 김치를 먼저 볶아야 해? 아니면 바로 물 넣어도 돼?",
        ],
        recall_query="이야기했던 김치찌개 만드는 법 핵심만 정리해줘.",
        expected_keywords=["김치찌개", "레시피", "돼지고기"],
    ),
    TestCase(
        name="운동_루틴",
        seed_messages=[
            "직장인이 퇴근 후 집에서 할 수 있는 30분 전신 운동 루틴 만들어줘.",
            "그 루틴에서 코어 운동을 더 강화하려면 어떤 동작을 추가하면 좋을까?",
        ],
        recall_query="전에 만들었던 운동 루틴이랑 코어 강화 방법 뭐였지?",
        expected_keywords=["운동", "루틴", "코어"],
    ),
    TestCase(
        name="SQLAlchemy_쿼리최적화",
        seed_messages=[
            "SQLAlchemy 2.0에서 N+1 문제를 해결하는 방법을 알려줘. selectinload와 joinedload 차이도.",
            "대용량 테이블에서 SQLAlchemy로 페이지네이션 할 때 keyset pagination이 왜 더 효율적이야?",
        ],
        recall_query="지난번에 이야기한 SQLAlchemy 쿼리 최적화 방법 다시 정리해줘.",
        expected_keywords=["SQLAlchemy", "N+1", "joinedload", "페이지네이션"],
    ),
]


# ── HTTP helpers ─────────────────────────────────────────────────────────────

def _headers() -> dict[str, str]:
    return {"X-Ailog-Api-Key": cfg.api_key, "Content-Type": "application/json"}


def _post(client: httpx.Client, path: str, payload: dict[str, Any], timeout: float = 60.0) -> dict[str, Any]:
    resp = client.post(f"{cfg.api_url}{path}", json=payload, headers=_headers(), timeout=timeout)
    resp.raise_for_status()
    return resp.json()


def _get(client: httpx.Client, path: str, timeout: float = 30.0) -> dict[str, Any]:
    resp = client.get(f"{cfg.api_url}{path}", timeout=timeout)
    resp.raise_for_status()
    return resp.json()


# ── Quality helpers ───────────────────────────────────────────────────────────

def _keyword_coverage(expected: list[str], text: str) -> float:
    """Fraction of expected keywords found (case-insensitive substring) in text."""
    if not expected:
        return 1.0
    text_lower = text.lower()
    hits = sum(1 for kw in expected if kw.lower() in text_lower)
    return hits / len(expected)


def _found_keywords(expected: list[str], text: str) -> list[str]:
    text_lower = text.lower()
    return [kw for kw in expected if kw.lower() in text_lower]


def _missing_keywords(expected: list[str], text: str) -> list[str]:
    text_lower = text.lower()
    return [kw for kw in expected if kw.lower() not in text_lower]


# ── Benchmark phases ─────────────────────────────────────────────────────────

def seed_conversation(client: httpx.Client, case: TestCase) -> tuple[str, float]:
    session_id: str | None = None
    t0 = time.perf_counter()
    for msg in case.seed_messages:
        payload: dict[str, Any] = {"content": msg}
        if session_id:
            payload["session_id"] = session_id
        resp = _post(client, "/api/v1/chat/messages", payload)
        session_id = resp["session_id"]
    return session_id, (time.perf_counter() - t0) * 1000  # type: ignore[return-value]


def build_and_assess_episodes(
    client: httpx.Client, session_id: str, expected_keywords: list[str]
) -> tuple[list[str], EpisodeQuality, float]:
    t0 = time.perf_counter()
    resp = _post(client, f"/api/v1/episodes/build-from-session/{session_id}", {}, timeout=120.0)
    elapsed = (time.perf_counter() - t0) * 1000

    if not resp:
        return [], EpisodeQuality(), elapsed

    # Assess the first (primary) built episode
    first = resp[0]
    episode_id = first["episode_id"]
    metadata = first.get("metadata") or {}
    semantic_text = metadata.get("semantic_text", "") or ""
    ep_keywords: list[str] = first.get("keywords") or []

    # Keyword coverage: search title + keywords list + semantic_text
    searchable = " ".join([first.get("title", ""), " ".join(ep_keywords), semantic_text])
    coverage = _keyword_coverage(expected_keywords, searchable)

    quality = EpisodeQuality(
        episode_id=episode_id,
        title=first.get("title", ""),
        keywords=ep_keywords,
        semantic_text=semantic_text,
        keyword_coverage=coverage,
        has_insight=bool(metadata.get("decision_or_insight", "").strip()),
    )
    episode_ids = [ep["episode_id"] for ep in resp]
    return episode_ids, quality, elapsed


def run_retrieval_and_assess(
    client: httpx.Client, query: str, session_id: str, expected_keywords: list[str]
) -> tuple[list[str], RetrievalQuality, float]:
    t0 = time.perf_counter()
    resp = _post(client, "/api/v1/retrieval", {"query": query, "session_id": session_id})
    elapsed = (time.perf_counter() - t0) * 1000

    episodes = resp.get("episodes") or []
    semantic_text = resp.get("semantic_text") or ""

    if not episodes:
        quality = RetrievalQuality(no_result=True)
        return [], quality, elapsed

    top = episodes[0]
    coverage = _keyword_coverage(expected_keywords, semantic_text)
    quality = RetrievalQuality(
        score=top.get("score", 0.0),
        retrieved_title=top.get("title", ""),
        semantic_text=semantic_text,
        text_coverage=coverage,
        no_result=False,
    )
    retrieved_ids = [ep["episode_id"] for ep in episodes]
    return retrieved_ids, quality, elapsed


# ── Runner ────────────────────────────────────────────────────────────────────

def run_case(client: httpx.Client, case: TestCase) -> CaseResult:
    result = CaseResult(name=case.name)
    try:
        session_id, result.seed_ms = seed_conversation(client, case)

        built_ids, result.episode, result.build_ms = build_and_assess_episodes(
            client, session_id, case.expected_keywords
        )

        retrieved_ids, result.retrieval, result.retrieval_ms = run_retrieval_and_assess(
            client, case.recall_query, session_id, case.expected_keywords
        )

        seeded_set = set(built_ids)
        if retrieved_ids:
            result.hit_at_1 = retrieved_ids[0] in seeded_set
            result.any_hit = bool(seeded_set & set(retrieved_ids))
    except Exception as exc:
        result.error = str(exc)
    return result


# ── Reporting ─────────────────────────────────────────────────────────────────

_G = "\033[92m"
_R = "\033[91m"
_Y = "\033[93m"
_B = "\033[1m"
_DIM = "\033[2m"
_RST = "\033[0m"

def _pct_color(v: float) -> str:
    if v >= 0.75:
        return _G
    if v >= 0.5:
        return _Y
    return _R

def _score_color(v: float) -> str:
    if v >= 0.7:
        return _G
    if v >= 0.5:
        return _Y
    return _R

def _bool_icon(val: bool) -> str:
    return f"{_G}✓{_RST}" if val else f"{_R}✗{_RST}"

def _bar(fraction: float, width: int = 10) -> str:
    filled = round(fraction * width)
    return "█" * filled + "░" * (width - filled)


def print_report(results: list[CaseResult], cases: list[TestCase]) -> None:
    case_map = {c.name: c for c in cases}

    print(f"\n{_B}{'═' * 76}{_RST}")
    print(f"{_B}  aiLog E2E Benchmark  —  Quality + Latency{_RST}")
    print(f"{_B}{'═' * 76}{_RST}")

    for r in results:
        case = case_map.get(r.name)
        expected = case.expected_keywords if case else []

        print(f"\n{_B}▸ {r.name}{_RST}")
        if r.error:
            print(f"  {_R}ERROR: {r.error}{_RST}")
            continue

        ep = r.episode
        ret = r.retrieval

        # ── Episode build quality ────────────────────────────────────────────
        print(f"  {_B}[Episode Build]{_RST}  {ep.title[:70]}")

        kw_str = ", ".join(ep.keywords[:8])
        print(f"  키워드 ({len(ep.keywords)}개): {_DIM}{kw_str}{_RST}")

        found = _found_keywords(expected, " ".join(ep.keywords) + " " + ep.semantic_text)
        missing = _missing_keywords(expected, " ".join(ep.keywords) + " " + ep.semantic_text)
        cov_color = _pct_color(ep.keyword_coverage)
        print(
            f"  키워드 커버리지: {cov_color}{_bar(ep.keyword_coverage)} {ep.keyword_coverage:.0%}{_RST}"
            f"  found={_G}{found}{_RST}" + (f"  missing={_R}{missing}{_RST}" if missing else "")
        )

        semantic_preview = ep.semantic_text[:120].replace("\n", " ")
        print(f"  semantic_text ({len(ep.semantic_text)}자): {_DIM}{semantic_preview}…{_RST}")
        insight_icon = f"{_G}있음{_RST}" if ep.has_insight else f"{_Y}없음{_RST}"
        print(f"  decision_or_insight: {insight_icon}  build: {r.build_ms:.0f}ms")

        # ── Retrieval quality ────────────────────────────────────────────────
        print(f"  {_B}[Retrieval]{_RST}  hit@1={_bool_icon(r.hit_at_1)}")

        if ret.no_result:
            print(f"  {_R}검색 결과 없음 (threshold 미달){_RST}")
        else:
            score_color = _score_color(ret.score)
            print(f"  유사도 점수: {score_color}{ret.score:.4f}{_RST}  {_DIM}(≥0.7 양호 / ≥0.5 보통){_RST}")
            print(f"  반환된 제목: {ret.retrieved_title[:70]}")

            ret_found = _found_keywords(expected, ret.semantic_text)
            ret_missing = _missing_keywords(expected, ret.semantic_text)
            txt_cov_color = _pct_color(ret.text_coverage)
            print(
                f"  반환 텍스트 커버리지: {txt_cov_color}{_bar(ret.text_coverage)} {ret.text_coverage:.0%}{_RST}"
                f"  found={_G}{ret_found}{_RST}" + (f"  missing={_R}{ret_missing}{_RST}" if ret_missing else "")
            )
            ret_preview = ret.semantic_text[:120].replace("\n", " ")
            print(f"  semantic_text ({len(ret.semantic_text)}자): {_DIM}{ret_preview}…{_RST}")
            print(f"  retrieval: {r.retrieval_ms:.0f}ms  seed: {r.seed_ms:.0f}ms")

    # ── Summary table ────────────────────────────────────────────────────────
    valid = [r for r in results if not r.error]
    print(f"\n{_B}{'─' * 76}{_RST}")
    print(f"{_B}  Summary ({len(valid)}/{len(results)} cases ok){_RST}\n")

    if not valid:
        print(f"  {_R}No valid results to summarize.{_RST}\n")
        return

    print(f"  {'Case':<26}  {'H@1':>3}  {'Score':>6}  {'EpCov':>6}  {'RetCov':>6}  {'Insight':>7}  {'Total':>7}")
    print(f"  {'-'*26}  {'-'*3}  {'-'*6}  {'-'*6}  {'-'*6}  {'-'*7}  {'-'*7}")
    for r in results:
        if r.error:
            print(f"  {r.name:<26}  {_R}ERROR{_RST}")
            continue
        total_ms = r.seed_ms + r.build_ms + r.retrieval_ms
        score_c = _score_color(r.retrieval.score)
        ep_cov_c = _pct_color(r.episode.keyword_coverage)
        ret_cov_c = _pct_color(r.retrieval.text_coverage)
        insight_icon = f"{_G}✓{_RST}" if r.episode.has_insight else f"{_Y}-{_RST}"
        print(
            f"  {r.name:<26}  {_bool_icon(r.hit_at_1):>3}  "
            f"{score_c}{r.retrieval.score:>6.4f}{_RST}  "
            f"{ep_cov_c}{r.episode.keyword_coverage:>5.0%}{_RST}  "
            f"{ret_cov_c}{r.retrieval.text_coverage:>5.0%}{_RST}  "
            f"  {insight_icon}       "
            f"{total_ms:>6.0f}ms"
        )

    print(f"\n  {_B}Averages{_RST}")
    hit1_pct = sum(r.hit_at_1 for r in valid) / len(valid) * 100
    avg_score = sum(r.retrieval.score for r in valid) / len(valid)
    avg_ep_cov = sum(r.episode.keyword_coverage for r in valid) / len(valid)
    avg_ret_cov = sum(r.retrieval.text_coverage for r in valid) / len(valid)
    insight_pct = sum(r.episode.has_insight for r in valid) / len(valid) * 100
    avg_seed = sum(r.seed_ms for r in valid) / len(valid)
    avg_build = sum(r.build_ms for r in valid) / len(valid)
    avg_retr = sum(r.retrieval_ms for r in valid) / len(valid)

    h_c = _pct_color(hit1_pct / 100)
    s_c = _score_color(avg_score)
    ec_c = _pct_color(avg_ep_cov)
    rc_c = _pct_color(avg_ret_cov)
    ic_c = _pct_color(insight_pct / 100)

    print(f"  hit@1:               {h_c}{hit1_pct:.0f}%{_RST}   (top result from seeded session)")
    print(f"  retrieval score:     {s_c}{avg_score:.4f}{_RST}  (vector similarity, ≥0.7 target)")
    print(f"  episode coverage:    {ec_c}{avg_ep_cov:.0%}{_RST}   (expected keywords in built episode)")
    print(f"  retrieval coverage:  {rc_c}{avg_ret_cov:.0%}{_RST}   (expected keywords in returned text)")
    print(f"  insight rate:        {ic_c}{insight_pct:.0f}%{_RST}   (episodes with decision_or_insight)")
    print(f"  avg latency:         seed={avg_seed:.0f}ms  build={avg_build:.0f}ms  retr={avg_retr:.0f}ms")
    print()


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="aiLog E2E benchmark")
    parser.add_argument("--api-url", default=cfg.api_url)
    parser.add_argument("--api-key", default=cfg.api_key)
    parser.add_argument("--case", help="Run only this test case by name")
    parser.add_argument("--json", dest="json_output", metavar="FILE")
    args = parser.parse_args()

    cfg.api_url = args.api_url
    cfg.api_key = args.api_key

    cases = TEST_CASES
    if args.case:
        cases = [c for c in TEST_CASES if c.name == args.case]
        if not cases:
            names = [c.name for c in TEST_CASES]
            print(f"Unknown case '{args.case}'. Available: {names}")
            sys.exit(1)

    print(f"\nRunning {len(cases)} case(s) against {cfg.api_url}")
    print("Each case: seed (2 turns LLM) → episode build (LLM) → retrieval (embed+LLM curator)\n")

    results: list[CaseResult] = []
    with httpx.Client() as client:
        for i, case in enumerate(cases, 1):
            print(f"  [{i}/{len(cases)}] {case.name} ...", end=" ", flush=True)
            t0 = time.perf_counter()
            result = run_case(client, case)
            elapsed = time.perf_counter() - t0
            results.append(result)
            if result.error:
                print(f"ERROR ({elapsed:.1f}s)")
            else:
                score_str = f"score={result.retrieval.score:.3f}" if not result.retrieval.no_result else "no-result"
                print(
                    f"{'✓' if result.hit_at_1 else '✗'}  "
                    f"ep_cov={result.episode.keyword_coverage:.0%}  "
                    f"ret_cov={result.retrieval.text_coverage:.0%}  "
                    f"{score_str}  ({elapsed:.1f}s)"
                )

    print_report(results, cases)

    if args.json_output:
        raw = [
            {
                "name": r.name,
                "hit_at_1": r.hit_at_1,
                "any_hit": r.any_hit,
                "episode": {
                    "title": r.episode.title,
                    "keywords": r.episode.keywords,
                    "keyword_coverage": r.episode.keyword_coverage,
                    "semantic_text_len": len(r.episode.semantic_text),
                    "has_insight": r.episode.has_insight,
                },
                "retrieval": {
                    "score": r.retrieval.score,
                    "retrieved_title": r.retrieval.retrieved_title,
                    "text_coverage": r.retrieval.text_coverage,
                    "semantic_text_len": len(r.retrieval.semantic_text),
                    "no_result": r.retrieval.no_result,
                },
                "latency_ms": {
                    "seed": r.seed_ms,
                    "build": r.build_ms,
                    "retrieval": r.retrieval_ms,
                },
                "error": r.error,
            }
            for r in results
        ]
        Path(args.json_output).write_text(json.dumps(raw, ensure_ascii=False, indent=2))
        print(f"Results written to {args.json_output}\n")


if __name__ == "__main__":
    main()
