# RawLog Full Conversation Storage Implementation

## Goal

This document focuses only on **full conversation storage between ChatGPT and the user** within the current aiLog directory structure.

At this stage, the scope is intentionally limited to:

- creating a conversation session
- storing each user/assistant message as RawLog
- restoring a full session conversation in order

The following are **out of scope for now**:

- gist generation
- episode construction
- long-term memory promotion
- semantic search
- reinjection

---

## Current Focus

The current objective is to make the backend behave as a reliable **RawLog storage server**.

Basic flow:

```text
start session
→ save user message
→ save assistant message
→ repeat
→ read full conversation by session
```

---

## Directory Scope

The implementation should use only the following parts of the current backend structure:

```text
apps/api/app/
├─ db/models/
│  ├─ session.py
│  └─ rawlog.py
├─ db/repositories/
│  ├─ session_repository.py
│  └─ rawlog_repository.py
├─ schemas/
│  ├─ session.py
│  └─ rawlog.py
├─ services/
│  ├─ session_service.py
│  └─ rawlog_service.py
└─ api/v1/endpoints/
   ├─ sessions.py
   └─ rawlogs.py
```

The following folders remain unused for this phase:

- `pipeline/`
- `search/`
- `llm/`
- `gist`
- `episode`
- `memory`

---

## Required Data Model

### 1. Session

A session represents one conversation thread.

Recommended fields:

| field | type | required | description |
|---|---|---:|---|
| `session_id` | string | yes | unique session identifier |
| `user_id` | string | no | optional user identifier |
| `title` | string | no | optional session title |
| `started_at` | datetime | yes | session start time |
| `last_activity_at` | datetime | yes | latest message time |
| `status` | string | yes | e.g. `active`, `closed` |

### 2. RawLog

A RawLog is the atomic stored message unit.

Recommended fields:

| field | type | required | description |
|---|---|---:|---|
| `rawlog_id` | string | yes | unique message id |
| `session_id` | string | yes | owning session |
| `sequence_no` | integer | yes | message order inside the session |
| `speaker_type` | string | yes | `user`, `assistant`, `system` |
| `content` | text | yes | original message text |
| `occurred_at` | datetime | yes | message creation time |
| `message_type` | string | no | `question`, `answer`, `system`, `other` |
| `reply_to_rawlog_id` | string | no | linked parent message |
| `source_model` | string | no | model name if assistant message |
| `stored_at` | datetime | no | database insert/update time |
| `metadata` | jsonb | no | future extension metadata |

---

## Why This Structure

This design is the minimum reliable structure for full conversation storage because it guarantees:

- session grouping
- strict ordering
- original content preservation
- future traceability
- compatibility with later gist/episode generation

In other words:

- `Session` = conversation container
- `RawLog` = source-of-truth message record

---

## API Requirements

Only three APIs are needed for this phase.

### 1. Create Session

**Endpoint**

```http
POST /api/v1/sessions
```

**Purpose**

- starts a new conversation session
- returns a `session_id`

**Example response**

```json
{
  "session_id": "sess_001",
  "started_at": "2026-04-24T13:00:00Z",
  "status": "active"
}
```

---

### 2. Save RawLog Message

**Endpoint**

```http
POST /api/v1/rawlogs
```

**Purpose**

- stores one message at a time
- supports both user and assistant messages

**Example request: user message**

```json
{
  "session_id": "sess_001",
  "sequence_no": 1,
  "speaker_type": "user",
  "content": "Please summarize the aiLog structure again.",
  "occurred_at": "2026-04-24T13:01:10Z",
  "message_type": "question"
}
```

**Example request: assistant message**

```json
{
  "session_id": "sess_001",
  "sequence_no": 2,
  "speaker_type": "assistant",
  "content": "Sure. The structure can be summarized as follows...",
  "occurred_at": "2026-04-24T13:01:15Z",
  "message_type": "answer",
  "source_model": "chatgpt"
}
```

---

### 3. Read Session RawLogs

**Endpoint**

```http
GET /api/v1/sessions/{session_id}/rawlogs
```

**Purpose**

- returns the full conversation for one session
- preserves message order with `sequence_no`

**Example response**

```json
{
  "session_id": "sess_001",
  "messages": [
    {
      "rawlog_id": "raw_001",
      "sequence_no": 1,
      "speaker_type": "user",
      "content": "Please summarize the aiLog structure again."
    },
    {
      "rawlog_id": "raw_002",
      "sequence_no": 2,
      "speaker_type": "assistant",
      "content": "Sure. The structure can be summarized as follows..."
    }
  ]
}
```

---

## Service Layer Responsibilities

### Session Service

`apps/api/app/services/session_service.py`

Responsibilities:

- create a new session
- validate session existence
- update `last_activity_at`
- read session metadata

### RawLog Service

`apps/api/app/services/rawlog_service.py`

Responsibilities:

- validate session existence
- generate `rawlog_id`
- store one message
- enforce `sequence_no` consistency
- fetch full session messages in ascending order

---

## Repository Layer Responsibilities

### Session Repository

`apps/api/app/db/repositories/session_repository.py`

Responsibilities:

- insert session row
- read session by id
- update session timestamps
- list sessions if needed later

### RawLog Repository

`apps/api/app/db/repositories/rawlog_repository.py`

Responsibilities:

- insert message row
- read messages by `session_id`
- order by `sequence_no`
- optionally read latest message in a session

---

## Endpoint Responsibilities

### `sessions.py`

Must provide:

- `POST /sessions`
- optionally `GET /sessions/{session_id}` later

### `rawlogs.py`

Must provide:

- `POST /rawlogs`

Additionally, session-scoped rawlog reading can either be:

- added to `sessions.py`, or
- implemented as `GET /rawlogs/session/{session_id}`

The cleaner option is:

```http
GET /api/v1/sessions/{session_id}/rawlogs
```

---

## Implementation Sequence

The recommended order of work is:

### Step 1. Add session model
File:
- `apps/api/app/db/models/session.py`

### Step 2. Finalize rawlog model
File:
- `apps/api/app/db/models/rawlog.py`

### Step 3. Add pydantic schemas
Files:
- `apps/api/app/schemas/session.py`
- `apps/api/app/schemas/rawlog.py`

### Step 4. Implement repositories
Files:
- `apps/api/app/db/repositories/session_repository.py`
- `apps/api/app/db/repositories/rawlog_repository.py`

### Step 5. Implement services
Files:
- `apps/api/app/services/session_service.py`
- `apps/api/app/services/rawlog_service.py`

### Step 6. Add API endpoints
Files:
- `apps/api/app/api/v1/endpoints/sessions.py`
- `apps/api/app/api/v1/endpoints/rawlogs.py`

### Step 7. Register routers
File:
- `apps/api/app/api/v1/router.py`

### Step 8. Test manually
Recommended order:

1. create session
2. save user message
3. save assistant message
4. read full session messages

---

## Minimal Runtime Flow

For this phase, the runtime flow should be as simple as possible:

```text
[1] POST /sessions
    → returns session_id

[2] POST /rawlogs
    → stores user message

[3] POST /rawlogs
    → stores assistant message

[4] GET /sessions/{session_id}/rawlogs
    → restores full conversation
```

---

## Storage Principles

The RawLog phase must obey the following rules:

### 1. Store original text only
Do not summarize or transform the message before saving.

### 2. Save messages individually
Do not wait for the full conversation to end.

### 3. Preserve strict ordering
`sequence_no` must be stable and monotonic per session.

### 4. Keep session boundaries explicit
Every message must belong to exactly one session.

### 5. Make later derivation possible
Future gist/episode pipelines must be able to trace back to RawLog safely.

---

## Out of Scope for This Phase

The following should be postponed:

- automatic ChatGPT integration logic
- action/app connector integration
- gist extraction
- episode generation
- memory promotion
- embeddings
- retrieval
- reinjection
- OpenSearch or pgvector integration

The only goal now is to make sure that **conversation storage works reliably**.

---

## Definition of Done

This phase is complete when all of the following work:

- a new session can be created
- user messages can be stored as RawLog
- assistant messages can be stored as RawLog
- the full session conversation can be read back in order
- the stored content matches the original messages exactly

---

## Next Phase

Once RawLog storage is stable, the next implementation phase can be:

1. segmenting raw logs
2. generating gists
3. building episodes
4. promoting long-term memories

But none of those should start until RawLog storage is proven stable.
