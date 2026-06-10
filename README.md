# aiLog

> Conversations end. Meaning shouldn't.

aiLog is a long-term memory architecture for LLM interactions — not a chat logger, but a system that extracts, structures, and retrieves *meaning* across sessions.

**[한국어](#한국어) · [English](#english)**

---

<a name="english"></a>

## English

### The Problem

Every conversation with an LLM starts from zero.

Past ideas vanish. Context has to be re-explained. Insights that took hours to develop disappear the moment a session ends. The more you use LLMs, the more you lose.

This isn't a UX issue. It's an architectural one.

### What aiLog Does Differently

Most memory systems store raw conversation history and search it by keywords.

aiLog takes a different approach: **it stores meaning, not messages.**

Each conversation is processed into a structured memory hierarchy — from raw logs to semantic episodes to long-term memories — so that what gets retrieved is relevant understanding, not a wall of old text.

> Retrieving memory is not showing past conversations.  
> It is briefly bringing back the past meaning needed for the current conversation.

This demo shows how a lost discussion context can be reconstructed through a brief user clarification.
https://github.com/shjung-kr/ailog/docs/demo.mp4

---

### Memory Architecture

aiLog organizes conversation data into four semantic layers:

| Layer | Description |
|---|---|
| **RawLog** | Source-of-truth message log — unprocessed, immutable |
| **Gist** | Compact semantic extraction from segmented raw logs (up to 5 turns per segment, session-scoped, temporary) |
| **Episode** | Meaning-level conversational unit — cross-session, permanently merged, embedded and searchable |
| **Long-term Memory** | High-value memories promoted from episodes, surfaced across all sessions |

#### Why two intermediate layers?

**Gist** and **Episode** serve different roles:

| | Gist | Episode |
|---|---|---|
| Role | Compression buffer for a segment | Searchable semantic memory unit |
| Scope | Single session, up to 5 turns | Cross-session, topic-level |
| Lifetime | Temporary (deleted and regenerated on rebuild) | Permanent (merged, never deleted) |
| Embedding | None | Yes (`semantic_embedding`) |
| Searchable | No | Yes (via `RetrievalService`) |

As a session grows longer, storing the full turn history in context becomes impractical. Gist is the compressed buffer. Episode is the meaning that survives across sessions.

---

### Backend Pipeline

```
ingestion → segmentation → gist generation → episode construction → memory promotion → retrieval → reinjection
```

Memory doesn't accumulate passively — it is actively shaped, promoted, and reinjected into future conversations.

#### Full build flow

```
RawLog
  ↓ (after session idle)
Turn
  ↓
Segmenter (5-turn sliding window)
  ↓
GistGenerator (LLM segment summary)       ← if no Gist, uses Turn directly
  ↓
Gist
  ↓
EpisodeBuilder (LLM topic-level grouping)
  ↓
Episode (embedding stored, cross-session merge)
  ↓ (by importance_score)
LongTermMemory
```

---

### Episode Merging: How Thresholds Were Derived

Episode merging uses a two-stage decision:

1. **Pre-filter**: `cosine ≥ MIN_EMBEDDING_COSINE_FOR_MERGE (0.62)` — skips self-comparison with dropped sessions
2. **Final decision**: `merge_score ≥ EMBEDDING_MERGE_THRESHOLD (0.70)`

The merge score formula:
```
merge_score = cosine × 0.8 + keyword_jaccard × 0.1 + type_match × 0.1
```

These values were not arbitrary. The derivation process:

- **Mathematical boundary analysis**: Reverse-solving the threshold to find the minimum cosine required — even with perfect keyword and type match, cosine ≥ 0.675 is needed to pass 0.74. A pre-filter of 0.68 left almost no margin.
- **Korean embedding characteristics**: OpenAI `text-embedding-*` models tend to score Korean text lower than English. Same-topic Korean episodes often cluster in the 0.63–0.67 range, which the 0.68 pre-filter was cutting off.
- **Empirical adjustment**: After observing duplicate episodes forming when the same topic was discussed across sessions, thresholds were relaxed. A full rebuild (44 episodes → 38) confirmed convergence without duplicates.

**The final values (0.62 / 0.70) are empirically derived, not statistically optimized.** The reasoning behind them is documented to make future adjustment transparent.

---

### Semantic Retrieval

Most search systems match words. aiLog matches meaning.

| You want to find... | Keyword search | aiLog |
|---|---|---|
| A past discussion about heat capacity | ✅ exact match only | ✅ also finds "thermal transfer", related physics discussions |
| An idea about memory architecture | ✅ if you used that exact word | ✅ finds it even if you called it "memory unit" or "conversation chunk" |
| A creative phrasing you used once | ❌ | ✅ embedding similarity surfaces it |

#### How retrieval works

aiLog doesn't search raw messages — it searches **episodes**: meaning-level units extracted and embedded from conversation segments.

```
raw messages → segmentation → gist extraction → episode embedding → vector index
                                                                          ↓
                                                              cosine similarity search
                                                                          ↓
                                                              relevant episode(s) retrieved
                                                                          ↓
                                                              meaning reinjected into LLM context
```

Two retrieval modes work in combination:

- **Semantic search**: finds episodes by meaning, not keywords — through metadata embeddings and hybrid ranking, with a path to pgvector
- **Full-text search**: catches exact terms, names, and precise expressions

#### When retrieval activates

Retrieval runs on **every message** — there is no toggle or condition. `RetrievalService` is instantiated on every `POST /api/v1/chat/messages` request.

However, it silently exits without injecting context in three cases:

| Condition | Code location |
|---|---|
| Query is empty | `retrieval_service.py:103` |
| No episode exceeds the similarity threshold (0.35) | `:133` |
| LLM curator rejects all candidates | `:168` |

#### `recall_intent` and the UI

Retrieval always runs, but the UI only surfaces it conditionally:

- `recall_intent=false` — memory was injected silently; no banner shown (blends into the response naturally)
- `recall_intent=true` — **MemoryBanner** is shown ("◈ related memory" header)

When a `recall_intent=true` episode is injected, **web search is automatically disabled** for that turn (`use_web_search = False`). This prevents general web results from overriding personal memory context.

---

### Privacy by Design — Local-First Architecture

Your conversation data never touches a cloud storage system.

```
your machine                          external
─────────────────────────────         ──────────────
 conversations                         LLM API
 episodes            ── prompt ──▶    (OpenAI, etc.)
 long-term memory   ◀── response ──
 vector index
 (all local)
```

aiLog uses **MCP (Model Context Protocol)** as its integration layer — connecting with LLM providers in a standardized way without routing stored data through any third-party platform.

---

### Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Frontend | Next.js | Chat interface + search experience |
| API | FastAPI | Python service boundary for ingestion, retrieval, and LLM calls |
| Database | PostgreSQL + pgvector | Structured local storage with vector-search path |
| ORM | SQLAlchemy | Flexible conversation data management |
| Migration | Alembic | Controlled schema evolution |
| Future | OpenSearch / Qdrant | When retrieval complexity scales |

The local PostgreSQL instance runs on `127.0.0.1:5433` to avoid conflicts with an existing instance on 5432.

---

### Getting Started

**Prerequisites**: OpenAI API key required for LLM calls (episode generation, retrieval curation).

```bash
# Backend
python -m venv .venv
./.venv/bin/pip install -r requirements.txt

# Frontend
cd apps/web
npm install

# Environment
cp .env.example .env
# → Add your OPENAI_API_KEY to .env

# Run everything
npm run dev
```

Default database URL:
```
postgresql+psycopg://postgres:postgres@127.0.0.1:5433/ailog
```

If you manage PostgreSQL yourself:
```bash
SKIP_DB_START=1 DEV_DATABASE_URL=postgresql+psycopg://user:password@host:port/ailog npm run dev
```

**Database helpers:**
```bash
npm run db:up
npm run db:down
npm run db:logs
```

**Migrations:**
```bash
cd apps/api
alembic upgrade head
```

**Verify:**
```bash
npm run test:api
npm run build
```

#### Admin API Protection

Set `AILOG_ADMIN_API_KEY` in `.env` to protect mutation-heavy endpoints (memory promotion, style analysis, title embedding backfill, background job retry).

#### Web Search Control

Chat requests accept `use_web_search`. If omitted, `CHAT_WEB_SEARCH_DEFAULT` controls the default. Memory recall responses automatically disable web search to prevent general results from overriding personal memory context.

---

### Project Status

aiLog is in active development. Core implemented:

- [x] Episode generation and merging logic
- [x] Embedding-based similarity classification
- [x] Conversational memory retrieval with `recall_intent` detection
- [x] Real conversation system integration

Current focus: refining retrieval quality and long-term memory promotion heuristics.

---

### Vision

The long-term goal is not just memory retrieval — it's **user individuality modeling**.

As aiLog accumulates meaning across conversations, it begins to reflect how a person thinks: their recurring themes, preferred phrasings, evolving ideas. The system learns not just what was said, but *who is saying it*.

Built for people who think in conversations.

---
---

<a name="한국어"></a>

## 한국어

### 문제

LLM과의 모든 대화는 처음부터 시작한다.

지난 아이디어는 사라지고, 맥락은 다시 설명해야 하며, 몇 시간에 걸쳐 발전시킨 통찰은 세션이 끝나는 순간 소멸한다. LLM을 많이 쓸수록, 잃는 것도 많아진다.

이건 UX 문제가 아니다. 구조적인 문제다.

### aiLog가 다른 점

대부분의 메모리 시스템은 대화 원문을 저장하고 키워드로 검색한다.

aiLog는 다르게 접근한다. **메시지가 아니라 의미를 저장한다.**

각 대화는 구조화된 메모리 계층으로 처리된다 — 원본 로그에서 시맨틱 에피소드, 장기 기억으로 — 그래서 꺼내오는 것은 텍스트 더미가 아닌 관련된 이해다.

> 기억을 불러오는 것은 지난 대화를 보여주는 것이 아니다.  
> 지금 대화에 필요한 과거의 의미를 잠깐 다시 꺼내오는 것이다.

---

### 메모리 아키텍처

aiLog는 대화 데이터를 네 개의 시맨틱 레이어로 구성한다:

| 레이어 | 설명 |
|---|---|
| **RawLog** | 원본 메시지 로그 — 처리되지 않은, 불변의 기록 |
| **Gist** | 세그먼트 단위 시맨틱 압축 (최대 5턴, 세션 내, 임시) |
| **Episode** | 의미 단위의 대화 객체 — 크로스 세션, 영구 병합, 임베딩 및 검색 가능 |
| **Long-term Memory** | 에피소드에서 승격된 고가치 기억, 모든 세션에서 참조 |

#### Gist와 Episode를 두 단계로 나누는 이유

| | Gist | Episode |
|---|---|---|
| 역할 | 세그먼트 압축 버퍼 | 검색 가능한 시맨틱 메모리 단위 |
| 범위 | 단일 세션 내 최대 5턴 | 크로스 세션, 토픽 단위 |
| 수명 | 임시 (재빌드 시 삭제·재생성) | 영구 (병합되며 누적) |
| 임베딩 | 없음 | 있음 (`semantic_embedding`) |
| 검색 대상 | 아님 | 됨 (via `RetrievalService`) |

세션이 길어질수록 전체 턴 원본을 컨텍스트에 담는 것은 비현실적이다. Gist는 그 압축 버퍼다. Episode는 세션을 넘어 살아남는 의미다.

---

### 백엔드 파이프라인

```
수집 → 세그멘테이션 → gist 생성 → 에피소드 구성 → 메모리 승격 → 검색 → 재주입
```

메모리는 수동적으로 쌓이지 않는다 — 능동적으로 형성되고, 승격되고, 미래 대화에 재주입된다.

#### 전체 빌드 흐름

```
RawLog
  ↓ (세션 idle 감지 후)
Turn
  ↓
Segmenter (5턴씩 슬라이딩)
  ↓
GistGenerator (LLM 세그먼트 요약)       ← Gist가 없으면 Turn 직접 사용
  ↓
Gist
  ↓
EpisodeBuilder (LLM 주제 단위 그룹화)
  ↓
Episode (임베딩 저장, 크로스 세션 병합)
  ↓ (importance_score 기준)
LongTermMemory
```

---

### 에피소드 병합: 임계값 도출 과정

에피소드 병합은 2단계 판단 구조다:

1. **프리필터**: `cosine ≥ MIN_EMBEDDING_COSINE_FOR_MERGE (0.62)` — 탈락 세션과의 비교 자체를 차단
2. **최종 판단**: `merge_score ≥ EMBEDDING_MERGE_THRESHOLD (0.70)`

병합 점수 공식:
```
merge_score = cosine × 0.8 + keyword_jaccard × 0.1 + type_match × 0.1
```

이 값들은 임의로 정한 게 아니다. 도출 과정:

- **수학적 경계 분석**: 0.70을 통과하는 최소 코사인을 역산하면 — 키워드·타입 완전 일치 상태에서도 cosine ≥ 0.675가 필요하다. 프리필터가 0.68이면 여유폭이 거의 없었다.
- **한국어 임베딩 특성**: OpenAI `text-embedding-*` 모델은 한국어 텍스트에서 영어 대비 코사인 유사도가 낮게 측정되는 경향이 있다. 같은 주제의 한국어 에피소드 두 개를 임베딩해도 0.63~0.67 구간에 몰리는 케이스가 발생했고, 이게 프리필터(0.68)에서 걸러졌다.
- **실증 관찰 후 조정**: 동일 주제를 다른 세션에서 다시 대화했을 때 별도 에피소드가 중복 생성되는 현상을 확인하고 임계값 완화. 전체 재빌드(에피소드 44개 → 38개)로 중복 없이 수렴하는 것을 검증했다.

**결론: 0.62 / 0.70은 통계적으로 최적화된 값이 아닌, 수학적 역산 + 한국어 임베딩 특성 + 실증 재빌드 검증의 조합으로 결정된 경험적 값이다.** 향후 조정 시 이 근거를 출발점으로 삼을 수 있다.

---

### 시맨틱 검색

대부분의 검색 시스템은 단어를 매칭한다. aiLog는 의미를 매칭한다.

| 찾고 싶은 것 | 키워드 검색 | aiLog |
|---|---|---|
| 비열 관련 과거 토론 | ✅ 정확한 단어만 | ✅ "열전달", "온도 변화율" 등 관련 표현도 |
| 메모리 아키텍처 아이디어 | ✅ 그 단어를 썼을 때만 | ✅ "메모리 단위", "대화 덩어리"로 표현해도 |
| 한 번 썼던 창의적인 표현 | ❌ | ✅ 임베딩 유사도로 발견 |

#### 검색 동작 방식

aiLog는 원본 메시지가 아닌 **에피소드** — 대화 세그먼트에서 추출·임베딩된 의미 단위 — 를 검색한다.

```
원본 메시지 → 세그멘테이션 → gist 추출 → 에피소드 임베딩 → 벡터 인덱스
                                                                    ↓
                                                        코사인 유사도 검색
                                                                    ↓
                                                        관련 에피소드 검색
                                                                    ↓
                                                        LLM 컨텍스트에 의미 재주입
```

두 가지 검색 모드가 함께 동작한다:

- **시맨틱 검색**: 키워드가 아닌 의미로 에피소드를 찾음 — 메타데이터 임베딩과 하이브리드 랭킹, pgvector로의 경로 확보
- **전문 검색**: 정확한 용어, 이름, 표현을 잡아냄

#### Retrieval 활성화 시점

Retrieval은 **매 메시지마다 무조건 실행된다** — 토글이나 조건 분기가 없다. `POST /api/v1/chat/messages` 요청이 들어오면 항상 `RetrievalService`가 호출된다.

단, 아무것도 주입하지 않고 조용히 종료되는 3가지 경우가 있다:

| 상황 | 코드 위치 |
|---|---|
| 쿼리가 비어 있음 | `retrieval_service.py:103` |
| threshold(0.35) 넘는 에피소드 없음 | `:133` |
| LLM curator가 모두 탈락시킴 | `:168` |

#### `recall_intent`와 UI

Retrieval은 항상 실행되지만 UI는 조건부로 표시된다:

- `recall_intent=false` — 메모리가 조용히 주입됨, 배너 없음 (자연스럽게 녹아듦)
- `recall_intent=true` — **MemoryBanner** 표시 ("◈ 연관 기억" 초록 배너)

`recall_intent=true`인 에피소드가 주입되면 **웹 서치가 자동으로 비활성화된다** (`use_web_search = False`). 과거 대화를 기억에서 불러온 상황에서 웹 검색 결과가 섞이지 않게 막는 장치다.

---

### 프라이버시 설계 — 로컬 퍼스트 아키텍처

대화 데이터는 클라우드 스토리지에 닿지 않는다.

```
내 머신                               외부
─────────────────────────────         ──────────────
 conversations                         LLM API
 episodes            ── 프롬프트 ──▶  (OpenAI 등)
 long-term memory   ◀── 응답 ──
 vector index
 (모두 로컬)
```

aiLog는 **MCP (Model Context Protocol)** 을 통합 레이어로 사용한다 — 저장된 데이터를 서드파티 플랫폼을 거치지 않고 LLM 제공자와 표준화된 방식으로 연결한다.

---

### 기술 스택

| 레이어 | 선택 | 이유 |
|---|---|---|
| 프론트엔드 | Next.js | 채팅 인터페이스 + 검색 경험 |
| API | FastAPI | 수집, 검색, LLM 호출을 위한 Python 서비스 경계 |
| 데이터베이스 | PostgreSQL + pgvector | 벡터 검색 경로를 가진 구조화된 로컬 스토리지 |
| ORM | SQLAlchemy | 유연한 대화 데이터 관리 |
| 마이그레이션 | Alembic | 제어된 스키마 진화 |
| 향후 | OpenSearch / Qdrant | 검색 복잡도가 스케일할 때 |

로컬 개발 PostgreSQL 인스턴스는 기존 PostgreSQL(5432)과의 충돌을 피하기 위해 `127.0.0.1:5433`에서 실행된다.

---

### 시작하기

**사전 조건**: 에피소드 생성 및 검색 큐레이션을 위한 LLM 호출에 OpenAI API 키가 필요하다.

```bash
# 백엔드
python -m venv .venv
./.venv/bin/pip install -r requirements.txt

# 프론트엔드
cd apps/web
npm install

# 환경 설정
cp .env.example .env
# → .env에 OPENAI_API_KEY 추가

# 전체 실행
npm run dev
```

기본 데이터베이스 URL:
```
postgresql+psycopg://postgres:postgres@127.0.0.1:5433/ailog
```

PostgreSQL을 직접 관리하는 경우:
```bash
SKIP_DB_START=1 DEV_DATABASE_URL=postgresql+psycopg://user:password@host:port/ailog npm run dev
```

**DB 헬퍼:**
```bash
npm run db:up
npm run db:down
npm run db:logs
```

**마이그레이션:**
```bash
cd apps/api
alembic upgrade head
```

**검증:**
```bash
npm run test:api
npm run build
```

#### Admin API 보호

`.env`에 `AILOG_ADMIN_API_KEY`를 설정하면 메모리 승격, 스타일 분석, 타이틀 임베딩 백필, 백그라운드 작업 재시도 등 변경 비용이 큰 엔드포인트를 보호할 수 있다.

#### 웹 서치 제어

채팅 요청은 `use_web_search`를 받는다. 생략 시 `CHAT_WEB_SEARCH_DEFAULT`가 기본값을 제어한다. 메모리 recall 응답은 자동으로 웹 서치를 비활성화하여 개인 기억 컨텍스트가 일반 웹 결과로 대체되지 않도록 한다.

---

### 프로젝트 현황

aiLog는 활발히 개발 중이다. 현재 구현 완료:

- [x] 에피소드 생성 및 병합 로직
- [x] 임베딩 기반 유사도 분류
- [x] `recall_intent` 감지를 통한 대화형 메모리 검색
- [x] 실제 대화 시스템 통합

현재 포커스: 검색 품질 개선 및 장기 메모리 승격 휴리스틱 정교화.

---

### 비전

장기 목표는 단순한 메모리 검색이 아니다 — **사용자 개성 모델링**이다.

aiLog가 대화에 걸쳐 의미를 축적해가면서, 한 사람이 어떻게 생각하는지를 반영하기 시작한다: 반복되는 주제, 선호하는 표현, 진화하는 아이디어. 시스템은 무엇이 말해졌는지만이 아니라, *누가 말하고 있는지*를 학습한다.

대화로 생각하는 사람들을 위해 만들어졌다.
