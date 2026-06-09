from fastapi import Header, HTTPException, status

from app.core.config import settings


def verify_api_key(x_ailog_api_key: str | None = Header(default=None)) -> bool:
    if not settings.admin_api_key:
        return True
    if x_ailog_api_key == settings.admin_api_key:
        return True
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Missing or invalid aiLog admin API key",
    )
