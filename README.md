# aiLog

🌐 [한국어](./README.ko.md) | **English**

> **Conversations end. Meaning shouldn't.**

aiLog is a long-term memory architecture for LLM interactions — not just a chat logger, but a system that extracts, structures, and retrieves *meaning* across sessions.

---

## The Problem

Every conversation with an LLM starts from zero.

Past ideas vanish. Context has to be re-explained. Insights that took hours to develop disappear the moment a session ends. The more you use LLMs, the more you lose.

This isn't a UX issue. It's an architectural one.

---

## What aiLog Does Differently

Most memory systems store raw conversation history and search it by keywords.

aiLog takes a different approach: **it stores meaning, not messages.**

Each conversation is processed into a structured memory hierarchy — from raw logs to semantic episodes to long-term memories — so that what gets retrieved is *relevant understanding*, not a wall of old text.

The guiding principle:

> *Retrieving memory is not showing past conversations. It is briefly bringing back the past meaning needed for the current conversation.*

---

## Memory Architecture

aiLog organizes conversation data into four semantic layers:

| Layer | Description |
|---|---|
| **RawLog** | Source-of-truth message log — unprocessed, immutable |
| **Gist** | Compact semantic extraction from segmented raw logs |
| **Episode** | Meaning-level conversational unit derived from raw logs |
| **Long-term Memory** | Promoted high-value memories surfaced across sessions |

### Backend Pipeline

```text
ingestion → segmentation → gist generation → episode construction → memory promotion → retrieval → reinjection
```

Memory doesn't accumulate passively — it is actively shaped, promoted, and reinjected into future conversations.

---

## Core Objectives

- Store conversations in a persistent, structured format
- Extract meaning at the episode level, not just the message level
- Enable semantic retrieval of past ideas, decisions, and expressions
- Reinject retrieved context into LLM sessions for continuity
- Build toward a personalized, evolving model of the user over time

---

## Semantic Retrieval

Most search systems match words. aiLog matches *meaning*.

### What that looks like in practice

You don't need to remember what you said — or even how you said it.

| You want to find... | You might search... | Keyword search | aiLog |
|---|---|---|---|
| A past discussion about heat capacity | "specific heat" | ✅ exact match only | ✅ also finds "thermal transfer", "rate of temperature change", related physics discussions |
| An idea about memory architecture | "episode" | ✅ if you used that word | ✅ finds it even if you called it "memory unit" or "conversation chunk" |
| A creative phrasing you used once | anything paraphrased | ❌ | ✅ embedding similarity surfaces it |

### How it works

aiLog doesn't search raw messages — it searches **episodes**: meaning-level units extracted and embedded from conversation segments.

```text
raw messages → segmentation → gist extraction → episode embedding → vector index
                                                                          ↓
                                                              cosine similarity search
                                                                          ↓
                                                              relevant episode(s) retrieved
                                                                          ↓
                                                              meaning reinjected into LLM context
```

Two retrieval modes work in combination:

- **Semantic search**: finds episodes by meaning, not keywords — currently through metadata embeddings and application-level hybrid ranking, with a path to pgvector.
- **Full-text search**: catches exact terms, names, and precise expressions. The `app/search` module isolates this logic so it can be replaced by PostgreSQL FTS queries.

Retrieval isn't a search bar the user opens. It's triggered *during conversation* — when the LLM detects a natural reference to prior context and pulls only what's relevant.

---

## Privacy by Design — Local-First Architecture

Your conversation data never touches a cloud storage system.

aiLog is built on a **local-first principle**: all conversation history is stored and processed on your own machine. The only data that leaves your environment is what you explicitly send to an LLM API — and that's inherent to how any LLM works, not a choice aiLog makes.

```text
your machine                          external
─────────────────────────────         ──────────────
 conversations                         LLM API
 episodes            ── prompt ──▶    (OpenAI, etc.)
 long-term memory   ◀── response ──
 vector index
 (all local)
```

To make this work cleanly, aiLog adopts **MCP (Model Context Protocol)** as its integration layer. MCP allows aiLog to connect with LLM providers in a standardized way — without routing your stored data through any third-party platform.

The result: the intelligence of external LLMs, with the privacy of a local system.

---

## Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Frontend | Next.js | Chat interface + search experience |
| API | FastAPI | Python service boundary for ingestion, retrieval, and LLM calls |
| Database | PostgreSQL + pgvector | Structured local storage with a vector-search path |
| ORM | SQLAlchemy | Flexible conversation data management |
| Migration | Alembic | Controlled schema evolution |
| Future | OpenSearch / Qdrant | When retrieval complexity scales |

The local development PostgreSQL instance is exposed on `127.0.0.1:5433` to avoid conflicts with an existing PostgreSQL on `5432`.

---

## Project Status

aiLog is in active development. The current focus is on the episode memory layer and conversational retrieval — detecting natural references to prior conversations during dialogue and surfacing only what's relevant.

---

## Development

Install backend dependencies:

```bash
python -m venv .venv
./.venv/bin/pip install -r requirements.txt
```

Install frontend dependencies:

```bash
cd apps/web
npm install
```

Create local environment values:

```bash
cp .env.example .env
```

Run both services:

```bash
npm run dev
```

This starts the aiLog PostgreSQL container first, waits for it to accept connections, then starts the API and web app. The default database URL is:

```text
postgresql+psycopg://postgres:postgres@127.0.0.1:5433/ailog
```

If you already started PostgreSQL yourself, skip automatic DB startup:

```bash
SKIP_DB_START=1 DEV_DATABASE_URL=postgresql+psycopg://user:password@host:port/ailog npm run dev
```

DB helpers:

```bash
npm run db:up
npm run db:down
npm run db:logs
```

---

## Database Migrations

Alembic is configured in `apps/api/alembic.ini`.

```bash
cd apps/api
alembic upgrade head
```

`Base.metadata.create_all()` still runs at API startup for local development convenience, but schema changes should be captured as Alembic revisions.

---

## Admin API Protection

Set `AILOG_ADMIN_API_KEY` in `.env` to protect mutation-heavy or costly admin endpoints such as memory promotion, style analysis, title embedding backfill, and background job retry.

Frontend calls can pass the same key with:

```bash
NEXT_PUBLIC_AILOG_API_KEY=...
```

---

## Web Search Control

Chat requests accept `use_web_search`. If omitted, `CHAT_WEB_SEARCH_DEFAULT` controls the default. Memory recall answers with retrieved context automatically disable web search so the assistant does not replace personal memory with general web results.

---

## Verification

```bash
npm run test:api
npm run build
```

---

## Vision

The long-term goal is not just memory retrieval — it's **user individuality modeling**.

As aiLog accumulates meaning across conversations, it begins to reflect how a person thinks: their recurring themes, preferred phrasings, evolving ideas. The system learns not just *what* was said, but *who* is saying it.

---

*Built for people who think in conversations.*
