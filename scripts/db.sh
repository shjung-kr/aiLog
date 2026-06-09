#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -f "$ROOT_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
  set +a
fi

POSTGRES_PORT="${POSTGRES_PORT:-5433}"
POSTGRES_DB="${POSTGRES_DB:-ailog}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-postgres}"
COMPOSE_FILE="$ROOT_DIR/infrastructure/compose/docker-compose.yml"
CMD="${1:-up}"

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

if COMPOSE_BIN="$(compose_cmd)"; then
  case "$CMD" in
    up) POSTGRES_PORT="$POSTGRES_PORT" $COMPOSE_BIN -f "$COMPOSE_FILE" up -d postgres ;;
    down) $COMPOSE_BIN -f "$COMPOSE_FILE" down ;;
    logs) $COMPOSE_BIN -f "$COMPOSE_FILE" logs -f postgres ;;
    *) echo "Usage: $0 {up|down|logs}" >&2; exit 2 ;;
  esac
  exit 0
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker was not found." >&2
  exit 1
fi

case "$CMD" in
  up)
    if docker inspect ailog-postgres >/dev/null 2>&1; then
      if ! docker port ailog-postgres 5432/tcp >/dev/null 2>&1; then
        docker stop ailog-postgres >/dev/null 2>&1 || true
        docker rm ailog-postgres >/dev/null
      else
        docker start ailog-postgres >/dev/null
        exit 0
      fi
    fi
    if docker inspect ailog-postgres >/dev/null 2>&1; then
      docker start ailog-postgres >/dev/null
    else
      docker run -d \
        --name ailog-postgres \
        -e POSTGRES_DB="$POSTGRES_DB" \
        -e POSTGRES_USER="$POSTGRES_USER" \
        -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
        -p "127.0.0.1:${POSTGRES_PORT}:5432" \
        -v ailog_postgres_data:/var/lib/postgresql/data \
        -v "$ROOT_DIR/infrastructure/postgres/extensions.sql:/docker-entrypoint-initdb.d/001_extensions.sql:ro" \
        pgvector/pgvector:pg16 >/dev/null
    fi
    ;;
  down)
    docker stop ailog-postgres >/dev/null 2>&1 || true
    ;;
  logs)
    docker logs -f ailog-postgres
    ;;
  *)
    echo "Usage: $0 {up|down|logs}" >&2
    exit 2
    ;;
esac
