"""SQLite → PostgreSQL 마이그레이션 스크립트."""
import json
import sqlite3
import sys
from pathlib import Path

# apps/api를 경로에 추가
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "apps" / "api"))

from app.core.config import settings
from psycopg.types.json import Json
from sqlalchemy import create_engine, text

SQLITE_PATH = Path(__file__).resolve().parents[1] / "apps" / "api" / "ailog.db"

# 테이블별 설정: (sqlite_table, pg_table, columns, json_columns)
# json_columns: SQLite에서 TEXT로 저장된 JSON 컬럼 목록
TABLES = [
    {
        "name": "sessions",
        "columns": ["session_id", "user_id", "title", "started_at", "last_activity_at", "status"],
        "json_columns": [],
    },
    {
        "name": "raw_logs",
        "columns": [
            "rawlog_id", "session_id", "sequence_no", "speaker_type", "content",
            "occurred_at", "message_type", "reply_to_rawlog_id", "source_model",
            "stored_at", "metadata",
        ],
        "json_columns": ["metadata"],
    },
    {
        "name": "turns",
        "columns": [
            "turn_id", "session_id", "start_rawlog_id", "end_rawlog_id",
            "started_at", "ended_at", "metadata",
        ],
        "json_columns": ["metadata"],
    },
    {
        "name": "episodes",
        "columns": [
            "episode_id", "title", "summary", "episode_type",
            "start_rawlog_id", "end_rawlog_id", "start_at", "end_at",
            "emotion_signal", "importance_score", "source_session_id",
            "keywords", "metadata",
        ],
        "json_columns": ["keywords", "metadata"],
    },
    {
        "name": "episode_rawlogs",
        "columns": ["episode_id", "rawlog_id", "position"],
        "json_columns": [],
    },
    {
        "name": "gists",
        "columns": [
            "gist_id", "start_rawlog_id", "end_rawlog_id", "title",
            "gist_text", "topic", "intent", "created_at", "confidence", "metadata_json",
        ],
        "json_columns": ["metadata_json"],
    },
    {
        "name": "long_term_memories",
        "columns": [
            "memory_id", "episode_id", "title", "memory_text", "memory_type",
            "importance_score", "created_at", "metadata_json",
        ],
        "json_columns": ["metadata_json"],
    },
    {
        "name": "search_logs",
        "columns": [
            "log_id", "query", "session_id", "retrieved", "curated",
            "query_parse", "used_episode_id", "curator_reasoning", "created_at",
        ],
        "json_columns": ["retrieved", "curated", "query_parse"],
    },
]


def parse_json(value):
    if value is None:
        return None
    if isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value)
    except (json.JSONDecodeError, TypeError):
        return value


def adapt_json(value):
    parsed = parse_json(value)
    if parsed is None:
        return None
    return Json(parsed)


def migrate():
    if not SQLITE_PATH.exists():
        print(f"SQLite 파일 없음: {SQLITE_PATH}")
        sys.exit(1)

    sqlite_conn = sqlite3.connect(SQLITE_PATH)
    sqlite_conn.row_factory = sqlite3.Row

    pg_engine = create_engine(settings.database_url, future=True)

    print(f"SQLite: {SQLITE_PATH}")
    print(f"PostgreSQL: {settings.database_url}\n")

    total_migrated = 0

    with pg_engine.begin() as pg_conn:
        for table in TABLES:
            name = table["name"]
            columns = table["columns"]
            json_cols = set(table["json_columns"])

            rows = sqlite_conn.execute(f"SELECT * FROM {name}").fetchall()
            if not rows:
                print(f"  {name}: 0행 (건너뜀)")
                continue

            # 기존 PG 데이터 확인
            existing = pg_conn.execute(text(f"SELECT COUNT(*) FROM {name}")).scalar()
            if existing > 0:
                print(f"  {name}: PG에 이미 {existing}행 존재 → 건너뜀 (중복 방지)")
                continue

            col_list = ", ".join(columns)
            placeholders = ", ".join(f":{c}" for c in columns)
            insert_sql = text(f"INSERT INTO {name} ({col_list}) VALUES ({placeholders})")

            batch = []
            for row in rows:
                record = {}
                for col in columns:
                    val = row[col] if col in row.keys() else None
                    record[col] = adapt_json(val) if col in json_cols else val
                batch.append(record)

            pg_conn.execute(insert_sql, batch)
            print(f"  {name}: {len(batch)}행 마이그레이션 완료")
            total_migrated += len(batch)

    sqlite_conn.close()
    print(f"\n총 {total_migrated}행 마이그레이션 완료.")


if __name__ == "__main__":
    migrate()
