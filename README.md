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

```
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
| A past discussion about heat capacity | "비열" | ✅ exact match only | ✅ also finds "열 전달", "온도 변화 속도", related physics discussions |
| An idea about memory architecture | "episode" | ✅ if you used that word | ✅ finds it even if you called it "기억 단위" or "대화 덩어리" |
| A creative phrasing you used once | anything paraphrased | ❌ | ✅ embedding similarity surfaces it |

### How it works

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

- **Semantic search** (pgvector): finds episodes by meaning, not keywords — using cosine similarity over sentence embeddings
- **Full-text search** (PostgreSQL FTS): catches exact terms, names, and precise expressions

Retrieval isn't a search bar the user opens. It's triggered *during conversation* — when the LLM detects a natural reference to prior context and pulls only what's relevant.

---

## Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Frontend | Next.js | Chat interface + search experience |
| Database | PostgreSQL | Structured conversation storage |
| Search | pgvector + Full-Text Search | Semantic + keyword retrieval |
| ORM | SQLAlchemy | Flexible conversation data management |
| Future | OpenSearch / Qdrant | When retrieval complexity scales |

The stack is intentionally lean for the first stage. The architecture is designed to scale search infrastructure independently as retrieval demands grow.

---

## Project Status

aiLog is in active development. The current focus is on the episode memory layer and conversational retrieval — detecting natural references to prior conversations during dialogue and surfacing only what's relevant.

---

## Vision

The long-term goal is not just memory retrieval — it's **user individuality modeling**.

As aiLog accumulates meaning across conversations, it begins to reflect how a person thinks: their recurring themes, preferred phrasings, evolving ideas. The system learns not just *what* was said, but *who* is saying it.

---

*Built for people who think in conversations.*
