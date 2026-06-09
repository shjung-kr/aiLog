#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -f "$ROOT_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
  set +a
fi

API_DIR="$ROOT_DIR/apps/api"
WEB_DIR="$ROOT_DIR/apps/web"
API_PORT="${API_PORT:-8000}"
WEB_PORT="${WEB_PORT:-3000}"
POSTGRES_PORT="${POSTGRES_PORT:-5433}"
POSTGRES_DB="${POSTGRES_DB:-ailog}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-postgres}"
POSTGRES_HOST="${POSTGRES_HOST:-127.0.0.1}"
DATABASE_URL="${DATABASE_URL:-postgresql+psycopg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}}"
DEV_DATABASE_URL="${DEV_DATABASE_URL:-$DATABASE_URL}"
COMPOSE_FILE="$ROOT_DIR/infrastructure/compose/docker-compose.yml"
PYTHON_BIN="$ROOT_DIR/.venv/bin/python"
if [[ ! -x "$PYTHON_BIN" ]]; then
  PYTHON_BIN="$(command -v python3 || true)"
fi

port_in_use() {
  "$PYTHON_BIN" - "$1" <<'PY'
import socket
import sys

port = int(sys.argv[1])
sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
try:
    sock.bind(("127.0.0.1", port))
except OSError:
    sys.exit(0)
finally:
    sock.close()

sys.exit(1)
PY
}

find_free_port() {
  local port="$1"
  while port_in_use "$port"; do
    port=$((port + 1))
  done
  echo "$port"
}

compose_cmd() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    echo "docker compose"
    return 0
  fi
  if command -v docker-compose >/dev/null 2>&1; then
    echo "docker-compose"
    return 0
  fi
  return 1
}

start_postgres() {
  if COMPOSE_BIN="$(compose_cmd)"; then
    POSTGRES_PORT="$POSTGRES_PORT" $COMPOSE_BIN -f "$COMPOSE_FILE" up -d postgres
    return
  fi

  if ! command -v docker >/dev/null 2>&1; then
    echo "Docker was not found, but PostgreSQL is required for DEV_DATABASE_URL=$DEV_DATABASE_URL"
    echo "Install Docker, or start PostgreSQL yourself and run:"
    echo "  SKIP_DB_START=1 npm run dev"
    exit 1
  fi

  if docker inspect ailog-postgres >/dev/null 2>&1; then
    if ! docker port ailog-postgres 5432/tcp >/dev/null 2>&1; then
      docker stop ailog-postgres >/dev/null 2>&1 || true
      docker rm ailog-postgres >/dev/null
    else
      docker start ailog-postgres >/dev/null
      return
    fi
  fi

  if docker inspect ailog-postgres >/dev/null 2>&1; then
    docker start ailog-postgres >/dev/null
    return
  fi

  docker run -d \
    --name ailog-postgres \
    -e POSTGRES_DB="$POSTGRES_DB" \
    -e POSTGRES_USER="$POSTGRES_USER" \
    -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
    -p "127.0.0.1:${POSTGRES_PORT}:5432" \
    -v ailog_postgres_data:/var/lib/postgresql/data \
    -v "$ROOT_DIR/infrastructure/postgres/extensions.sql:/docker-entrypoint-initdb.d/001_extensions.sql:ro" \
    pgvector/pgvector:pg16 >/dev/null
}

wait_for_postgres() {
  "$PYTHON_BIN" - "$DEV_DATABASE_URL" <<'PY'
import sys
import time

from sqlalchemy import create_engine, text

url = sys.argv[1]
engine = create_engine(url, future=True)
last_error = None
for _ in range(30):
    try:
        with engine.connect() as conn:
            conn.execute(text("select 1"))
        sys.exit(0)
    except Exception as exc:
        last_error = exc
        time.sleep(1)

print(f"PostgreSQL did not become ready: {last_error}", file=sys.stderr)
sys.exit(1)
PY
}

if [[ "$DEV_DATABASE_URL" == postgresql* && "${SKIP_DB_START:-0}" != "1" ]]; then
  echo "Starting aiLog PostgreSQL on 127.0.0.1:$POSTGRES_PORT"
  start_postgres
  wait_for_postgres
fi

REQUESTED_API_PORT="$API_PORT"
REQUESTED_WEB_PORT="$WEB_PORT"
API_PORT="$(find_free_port "$API_PORT")"
WEB_PORT="$(find_free_port "$WEB_PORT")"

if [[ "$API_PORT" != "$REQUESTED_API_PORT" ]]; then
  echo "API port $REQUESTED_API_PORT is in use; using $API_PORT instead."
fi

if [[ "$WEB_PORT" != "$REQUESTED_WEB_PORT" ]]; then
  echo "Web port $REQUESTED_WEB_PORT is in use; using $WEB_PORT instead."
fi

if [[ ! -x "$ROOT_DIR/.venv/bin/uvicorn" ]]; then
  echo "Missing API virtualenv. Create it and install requirements first:"
  echo "  python -m venv .venv"
  echo "  ./.venv/bin/pip install -r requirements.txt"
  exit 1
fi

if [[ ! -d "$WEB_DIR/node_modules" ]]; then
  echo "Missing web dependencies. Install them first:"
  echo "  cd apps/web && npm install"
  exit 1
fi

cleanup() {
  if [[ -n "${API_PID:-}" ]]; then
    kill "$API_PID" 2>/dev/null || true
  fi
  if [[ -n "${WEB_PID:-}" ]]; then
    kill "$WEB_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

echo "Starting aiLog API on http://127.0.0.1:$API_PORT"
(
  cd "$API_DIR"
  DATABASE_URL="$DEV_DATABASE_URL" "$ROOT_DIR/.venv/bin/uvicorn" app.main:app --host 127.0.0.1 --port "$API_PORT" --reload
) &
API_PID=$!

echo "Starting aiLog web on http://127.0.0.1:$WEB_PORT"
(
  cd "$WEB_DIR"
  NEXT_PUBLIC_API_BASE_URL="${NEXT_PUBLIC_API_BASE_URL:-http://127.0.0.1:$API_PORT}" \
  NEXT_PUBLIC_AILOG_API_KEY="${NEXT_PUBLIC_AILOG_API_KEY:-}" \
  npm run dev -- --hostname 127.0.0.1 --port "$WEB_PORT"
) &
WEB_PID=$!

wait -n "$API_PID" "$WEB_PID"
