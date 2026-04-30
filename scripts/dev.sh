#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$ROOT_DIR/apps/api"
WEB_DIR="$ROOT_DIR/apps/web"
API_PORT="${API_PORT:-8000}"
WEB_PORT="${WEB_PORT:-3000}"
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
  "$ROOT_DIR/.venv/bin/uvicorn" app.main:app --host 127.0.0.1 --port "$API_PORT" --reload
) &
API_PID=$!

echo "Starting aiLog web on http://127.0.0.1:$WEB_PORT"
(
  cd "$WEB_DIR"
  NEXT_PUBLIC_API_BASE_URL="${NEXT_PUBLIC_API_BASE_URL:-http://127.0.0.1:$API_PORT}" npm run dev -- --hostname 127.0.0.1 --port "$WEB_PORT"
) &
WEB_PID=$!

wait -n "$API_PID" "$WEB_PID"
