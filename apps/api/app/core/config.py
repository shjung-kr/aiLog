import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[4] / ".env", override=True)


class Settings:
    app_name = "aiLog API"

    # ── Database ──────────────────────────────────────────────────────────────
    # PostgreSQL 연결 URL. 기본값은 로컬 5433 포트 (5432 충돌 방지용).
    database_url = os.getenv("DATABASE_URL", "postgresql+psycopg://postgres:postgres@127.0.0.1:5433/ailog")

    # ── OpenAI ────────────────────────────────────────────────────────────────
    # LLM 호출(에피소드 생성, 검색 큐레이션)에 사용할 API 키.
    openai_api_key = os.getenv("OPENAI_API_KEY", "")
    # 에피소드 생성·요약·큐레이션에 사용할 chat 모델.
    # 비용↓ 원하면 gpt-4o-mini, 품질↑ 원하면 gpt-4o 로 변경.
    openai_model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    # 시맨틱 임베딩 생성에 사용할 모델.
    # text-embedding-3-small(기본, 저비용) / text-embedding-3-large(고품질) 중 선택.
    openai_embedding_model = os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")

    # ── Episode Pipeline ──────────────────────────────────────────────────────
    # 세션 마지막 메시지 이후 이 시간(초)이 지나면 에피소드 빌드를 트리거.
    # 낮출수록 빠르게 에피소드화, 높일수록 같은 세션으로 더 길게 묶음.
    episode_idle_seconds = int(os.getenv("EPISODE_IDLE_SECONDS", "30"))

    # ── Security ──────────────────────────────────────────────────────────────
    # 설정 시 /promote, /decay 등 Admin 전용 엔드포인트를 API 키로 보호.
    # 빈 문자열이면 인증 없이 누구나 호출 가능 (로컬 개발 전용).
    admin_api_key = os.getenv("AILOG_ADMIN_API_KEY", "")

    # ── Chat ──────────────────────────────────────────────────────────────────
    # 웹 서치 기본값. recall_intent=true 인 경우 이 값과 무관하게 서치가 비활성화됨.
    chat_web_search_default = os.getenv("CHAT_WEB_SEARCH_DEFAULT", "true").lower() in {"1", "true", "yes", "on"}

    # ── Gist / Segmentation ───────────────────────────────────────────────────
    # 이 값 이상의 코사인 유사도면 같은 세그먼트로 판단해 경계를 만들지 않음.
    # 낮출수록 세그먼트를 더 잘게 자름, 높일수록 더 길게 유지.
    gist_boundary_threshold = float(os.getenv("GIST_BOUNDARY_THRESHOLD", "0.75"))
    # 한 세그먼트에 포함할 최대 턴 수. 초과하면 강제로 분리.
    gist_max_segment_size = int(os.getenv("GIST_MAX_SEGMENT_SIZE", "8"))

    # ── Memory Decay ──────────────────────────────────────────────────────────
    # decay pass 후 importance_score 가 이 값 미만으로 떨어지면 LTM에서 삭제.
    # 낮출수록 오래된 기억을 더 오래 유지, 높일수록 더 공격적으로 정리.
    memory_decay_threshold = float(os.getenv("MEMORY_DECAY_THRESHOLD", "0.3"))

    # ── Retrieval ─────────────────────────────────────────────────────────────
    # 이 점수 미만인 에피소드는 후보에서 제외 (노이즈 차단).
    # 낮출수록 더 많은 후보가 큐레이터에게 넘어가고, 높일수록 precision 우선.
    retrieval_score_threshold = float(os.getenv("RETRIEVAL_SCORE_THRESHOLD", "0.30"))
    # 기술 도메인 쿼리에서 키워드 점수에 부여할 가중치 (0~1).
    # 높일수록 정확한 용어 일치를 더 강하게 반영.
    retrieval_keyword_weight_tech = float(os.getenv("RETRIEVAL_KEYWORD_WEIGHT_TECH", "0.35"))
    # 기술 도메인 에피소드에 부여하는 추가 점수 부스트.
    # 너무 높이면 기술 에피소드가 과도하게 우선됨.
    retrieval_tech_boost_weight = float(os.getenv("RETRIEVAL_TECH_BOOST_WEIGHT", "0.08"))


settings = Settings()
