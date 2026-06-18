import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[4] / ".env", override=True)


class Settings:
    app_name = "aiLog API"
    database_url = os.getenv("DATABASE_URL", "postgresql+psycopg://postgres:postgres@127.0.0.1:5433/ailog")
    openai_api_key = os.getenv("OPENAI_API_KEY", "")
    openai_model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    openai_embedding_model = os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")
    episode_idle_seconds = int(os.getenv("EPISODE_IDLE_SECONDS", "30"))
    admin_api_key = os.getenv("AILOG_ADMIN_API_KEY", "")
    chat_web_search_default = os.getenv("CHAT_WEB_SEARCH_DEFAULT", "true").lower() in {"1", "true", "yes", "on"}
    gist_boundary_threshold = float(os.getenv("GIST_BOUNDARY_THRESHOLD", "0.75"))
    gist_max_segment_size = int(os.getenv("GIST_MAX_SEGMENT_SIZE", "8"))
    memory_decay_threshold = float(os.getenv("MEMORY_DECAY_THRESHOLD", "0.3"))
    retrieval_score_threshold = float(os.getenv("RETRIEVAL_SCORE_THRESHOLD", "0.30"))
    retrieval_keyword_weight_tech = float(os.getenv("RETRIEVAL_KEYWORD_WEIGHT_TECH", "0.35"))
    retrieval_tech_boost_weight = float(os.getenv("RETRIEVAL_TECH_BOOST_WEIGHT", "0.08"))


settings = Settings()
