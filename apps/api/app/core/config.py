import os
from pathlib import Path


def _load_env_file() -> None:
    current = Path(__file__).resolve()
    candidates = [
        current.parents[4] / ".env",
        current.parents[2] / ".env",
    ]

    for env_path in candidates:
        if not env_path.exists():
            continue
        for raw_line in env_path.read_text().splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip("'\""))


_load_env_file()


class Settings:
    app_name = "aiLog API"
    database_url = os.getenv("DATABASE_URL", "sqlite:///./ailog.db")
    openai_api_key = os.getenv("OPENAI_API_KEY", "")
    openai_model = os.getenv("OPENAI_MODEL", "gpt-5.4-mini")
    episode_idle_seconds = int(os.getenv("EPISODE_IDLE_SECONDS", "60"))


settings = Settings()
