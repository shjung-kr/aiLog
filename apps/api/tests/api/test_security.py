import pytest
from fastapi import HTTPException

from app.core.config import settings
from app.core.security import verify_api_key


def test_verify_api_key_allows_when_not_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "admin_api_key", "")

    assert verify_api_key() is True


def test_verify_api_key_rejects_wrong_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "admin_api_key", "secret")

    with pytest.raises(HTTPException) as exc:
        verify_api_key("wrong")

    assert exc.value.status_code == 401


def test_verify_api_key_accepts_configured_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "admin_api_key", "secret")

    assert verify_api_key("secret") is True
