"""Initial aiLog schema.

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-06-09
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0001_initial_schema"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "sessions",
        sa.Column("session_id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_activity_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
    )
    op.create_index("ix_sessions_user_id", "sessions", ["user_id"])
    op.create_index("ix_sessions_started_at", "sessions", ["started_at"])
    op.create_index("ix_sessions_last_activity_at", "sessions", ["last_activity_at"])
    op.create_index("ix_sessions_status", "sessions", ["status"])

    op.create_table(
        "raw_logs",
        sa.Column("rawlog_id", sa.String(), primary_key=True),
        sa.Column("session_id", sa.String(), nullable=False),
        sa.Column("sequence_no", sa.Integer(), nullable=False),
        sa.Column("speaker_type", sa.String(length=32), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("message_type", sa.String(length=32), nullable=True),
        sa.Column("reply_to_rawlog_id", sa.String(), nullable=True),
        sa.Column("source_model", sa.String(length=128), nullable=True),
        sa.Column("stored_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=True),
        sa.UniqueConstraint("session_id", "sequence_no", name="uq_raw_logs_session_sequence"),
    )
    op.create_index("ix_raw_logs_session_id", "raw_logs", ["session_id"])
    op.create_index("ix_raw_logs_sequence_no", "raw_logs", ["sequence_no"])
    op.create_index("ix_raw_logs_speaker_type", "raw_logs", ["speaker_type"])
    op.create_index("ix_raw_logs_occurred_at", "raw_logs", ["occurred_at"])

    op.create_table(
        "turns",
        sa.Column("turn_id", sa.String(), primary_key=True),
        sa.Column("session_id", sa.String(), nullable=False),
        sa.Column("start_rawlog_id", sa.String(), nullable=False),
        sa.Column("end_rawlog_id", sa.String(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("metadata", sa.JSON(), nullable=True),
        sa.UniqueConstraint("start_rawlog_id", "end_rawlog_id", name="uq_turns_rawlog_range"),
    )
    op.create_index("ix_turns_session_id", "turns", ["session_id"])
    op.create_index("ix_turns_start_rawlog_id", "turns", ["start_rawlog_id"])
    op.create_index("ix_turns_end_rawlog_id", "turns", ["end_rawlog_id"])
    op.create_index("ix_turns_started_at", "turns", ["started_at"])
    op.create_index("ix_turns_ended_at", "turns", ["ended_at"])

    op.create_table(
        "gists",
        sa.Column("gist_id", sa.String(), primary_key=True),
        sa.Column("start_rawlog_id", sa.String(), nullable=False),
        sa.Column("end_rawlog_id", sa.String(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("gist_text", sa.Text(), nullable=False),
        sa.Column("topic", sa.String(length=255), nullable=True),
        sa.Column("intent", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
    )
    op.create_index("ix_gists_start_rawlog_id", "gists", ["start_rawlog_id"])
    op.create_index("ix_gists_end_rawlog_id", "gists", ["end_rawlog_id"])

    op.create_table(
        "episodes",
        sa.Column("episode_id", sa.String(), primary_key=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("episode_type", sa.String(length=64), nullable=False),
        sa.Column("start_rawlog_id", sa.String(), nullable=False),
        sa.Column("end_rawlog_id", sa.String(), nullable=False),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("emotion_signal", sa.String(length=64), nullable=True),
        sa.Column("importance_score", sa.Float(), nullable=True),
        sa.Column("source_session_id", sa.String(), nullable=True),
        sa.Column("keywords", sa.JSON(), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=True),
    )
    op.create_index("ix_episodes_episode_type", "episodes", ["episode_type"])
    op.create_index("ix_episodes_start_rawlog_id", "episodes", ["start_rawlog_id"])
    op.create_index("ix_episodes_end_rawlog_id", "episodes", ["end_rawlog_id"])
    op.create_index("ix_episodes_start_at", "episodes", ["start_at"])
    op.create_index("ix_episodes_end_at", "episodes", ["end_at"])
    op.create_index("ix_episodes_emotion_signal", "episodes", ["emotion_signal"])
    op.create_index("ix_episodes_source_session_id", "episodes", ["source_session_id"])

    op.create_table(
        "episode_rawlogs",
        sa.Column("episode_id", sa.String(), primary_key=True),
        sa.Column("rawlog_id", sa.String(), primary_key=True),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.UniqueConstraint("episode_id", "rawlog_id", name="uq_episode_rawlogs_episode_rawlog"),
    )

    op.create_table(
        "long_term_memories",
        sa.Column("memory_id", sa.String(), primary_key=True),
        sa.Column("episode_id", sa.String(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("memory_text", sa.Text(), nullable=False),
        sa.Column("memory_type", sa.String(length=64), nullable=False),
        sa.Column("importance_score", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
    )
    op.create_index("ix_long_term_memories_episode_id", "long_term_memories", ["episode_id"])
    op.create_index("ix_long_term_memories_memory_type", "long_term_memories", ["memory_type"])

    op.create_table(
        "search_logs",
        sa.Column("log_id", sa.String(), primary_key=True),
        sa.Column("query", sa.Text(), nullable=False),
        sa.Column("session_id", sa.String(), nullable=True),
        sa.Column("retrieved", sa.JSON(), nullable=True),
        sa.Column("curated", sa.JSON(), nullable=True),
        sa.Column("query_parse", sa.JSON(), nullable=True),
        sa.Column("used_episode_id", sa.String(), nullable=True),
        sa.Column("curator_reasoning", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_search_logs_session_id", "search_logs", ["session_id"])
    op.create_index("ix_search_logs_used_episode_id", "search_logs", ["used_episode_id"])


def downgrade() -> None:
    op.drop_table("search_logs")
    op.drop_table("long_term_memories")
    op.drop_table("episode_rawlogs")
    op.drop_table("episodes")
    op.drop_table("gists")
    op.drop_table("turns")
    op.drop_table("raw_logs")
    op.drop_table("sessions")
