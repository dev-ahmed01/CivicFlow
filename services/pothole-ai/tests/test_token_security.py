import pytest
from fastapi import HTTPException
from app.config import settings
from app.main import verify_internal_token


@pytest.mark.parametrize("token", [None, "", "change-me", "dev-secret-token-civicflow", "short-token"])
@pytest.mark.parametrize("mode,environment", [("real", "development"), ("demo", "production")])
def test_deployed_inference_fails_closed(monkeypatch, token, mode, environment):
    monkeypatch.setattr(settings, "pothole_ai_mode", mode)
    monkeypatch.setattr(settings, "env", environment)
    monkeypatch.setattr(settings, "pothole_ai_internal_token", token)
    with pytest.raises(HTTPException) as error:
        verify_internal_token(token)
    assert error.value.status_code == 503


def test_explicit_development_token(monkeypatch):
    monkeypatch.setattr(settings, "pothole_ai_mode", "demo")
    monkeypatch.setattr(settings, "env", "test")
    monkeypatch.setattr(settings, "pothole_ai_internal_token", "local-test-token")
    verify_internal_token("local-test-token")
    with pytest.raises(HTTPException) as error:
        verify_internal_token("wrong-token")
    assert error.value.status_code == 401
