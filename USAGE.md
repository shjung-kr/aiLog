# aiLog Usage Guide

This guide explains how to run aiLog locally from a fresh clone.

## Requirements

- Python 3.11 or newer
- Node.js and npm
- Docker
- An OpenAI API key for chat, embeddings, and retrieval

aiLog uses PostgreSQL with pgvector. The development scripts start a local `pgvector/pgvector:pg16` container on `127.0.0.1:5433`.

## Quick Start

Clone the repository:

```bash
git clone https://github.com/shjung-kr/aiLog.git
cd aiLog
```

Install backend dependencies:

```bash
python -m venv .venv
./.venv/bin/pip install -r requirements.txt
```

Install frontend dependencies:

```bash
cd apps/web
npm install
cd ../..
```

Create a local environment file:

```bash
cp .env.example .env
```

Edit `.env` and set:

```bash
OPENAI_API_KEY=your_openai_api_key
AILOG_ADMIN_API_KEY=any_private_admin_key
NEXT_PUBLIC_AILOG_API_KEY=the_same_admin_key_if_using_admin_buttons_from_the_web_ui
```

Start the app:

```bash
npm run dev
```

Open the web app:

```text
http://127.0.0.1:3000
```

The API runs at:

```text
http://127.0.0.1:8000
```

## Common Pages

| Page | URL | Purpose |
|---|---|---|
| Chat | `/chat` | Start or continue conversations |
| Sessions | `/sessions` | Browse stored conversation sessions |
| Episodes | `/episodes` | View extracted semantic episodes |
| Search | `/search` | Search remembered conversation meaning |
| Memories | `/memories` | View promoted long-term memories and style profile |

## Environment Variables

Important `.env` values:

| Variable | Description |
|---|---|
| `DATABASE_URL` | SQLAlchemy PostgreSQL URL used by the API |
| `POSTGRES_DB` | Local PostgreSQL database name |
| `POSTGRES_USER` | Local PostgreSQL user |
| `POSTGRES_PASSWORD` | Local PostgreSQL password |
| `POSTGRES_PORT` | Host port for local PostgreSQL, default `5433` |
| `OPENAI_API_KEY` | OpenAI API key used by chat and retrieval |
| `OPENAI_MODEL` | Chat/reasoning model |
| `OPENAI_EMBEDDING_MODEL` | Embedding model used for retrieval |
| `AILOG_ADMIN_API_KEY` | Protects admin endpoints |
| `NEXT_PUBLIC_API_BASE_URL` | API URL used by the web app |
| `NEXT_PUBLIC_AILOG_API_KEY` | Admin key sent by web admin actions |
| `CHAT_WEB_SEARCH_DEFAULT` | Enables web search by default for chat |

Do not commit `.env`. It is intentionally ignored by Git.

## Database Commands

Start PostgreSQL:

```bash
npm run db:up
```

Stop PostgreSQL:

```bash
npm run db:down
```

Follow PostgreSQL logs:

```bash
npm run db:logs
```

Run migrations:

```bash
cd apps/api
../../.venv/bin/alembic upgrade head
```

## Migrating Existing SQLite Data

If you have existing data in `apps/api/ailog.db`, migrate it into PostgreSQL:

```bash
DATABASE_URL=postgresql+psycopg://postgres:postgres@127.0.0.1:5433/ailog \
  ./.venv/bin/python scripts/migrate_sqlite_to_pg.py
```

The script skips tables that already contain PostgreSQL rows to avoid duplicate imports.

## Running Checks

Backend tests:

```bash
npm run test:api
```

Frontend build:

```bash
npm run buildo https://github.com/shjung-kr/aiLog.git
 ! [rejected]        main -> main (fetch first)
error: failed to push some refs to 'https://github.com/shjung-kr/aiLog.git'
hint: Updates were rejected because the remote contains work that you do not
hint: have locally. This is usually caused by another repository pushing to
hint: the same ref. If you want to integrate the remote changes, use
hint: 'git pull' before pushing again.
hint: See the 'Note about fast-forwards' in 'git push --help' for details.
```

## Troubleshooting

### `ERR_CONNECTION_REFUSED` for `127.0.0.1:8000`

The web app is running but the API is not. Start both from the repository root:

```bash
npm run dev
```

Avoid running only `npm run dev` inside `apps/web`, because that starts the frontend without the API.

### CORS error from `/api/v1/retrieval`

Check the API response. Browser CORS messages can hide backend errors. Common causes:

- Invalid or missing `OPENAI_API_KEY`
- API not running on `127.0.0.1:8000`
- Web app running on an unexpected port

Test directly:

```bash
curl -i http://127.0.0.1:8000/api/v1/sessions?limit=1 \
  -H 'Origin: http://localhost:3000'
```

### PostgreSQL password authentication failed

aiLog's development PostgreSQL runs on `127.0.0.1:5433` to avoid your system PostgreSQL on `5432`. Confirm `.env` uses:

```bash
DATABASE_URL=postgresql+psycopg://postgres:postgres@127.0.0.1:5433/ailog
```

Then restart:

```bash
npm run db:down
npm run db:up
npm run dev
```

### Retrieval returns OpenAI key errors

Update `.env`:

```bash
OPENAI_API_KEY=your_valid_key
```

Then restart the API with `npm run dev`.

## Git Workflow

Before pushing:

```bash
npm run test:api
npm run build
git status
```

If push is rejected because the remote has new commits:

```bash
git fetch origin
git rebase origin/main
npm run test:api
npm run build
git push origin main
```
