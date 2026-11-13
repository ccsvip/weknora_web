import pytest
from fastapi.testclient import TestClient

from tests.fake_upstream import FakeWeKnora
from weknora_web.db import get_engine, reset_engine
from weknora_web.main import create_app
from weknora_web.models import Base
from weknora_web.weknora.client import get_client


@pytest.fixture
def world(tmp_path, monkeypatch):
    database = tmp_path / "app.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{database}")
    monkeypatch.setenv("ACCESS_PASSWORD", "correct-password")
    monkeypatch.setenv("WEKNORA_API_KEY", "test-api-key")
    monkeypatch.setenv("ACCESS_SESSION_SECRET", "test-session-secret")
    monkeypatch.setenv("API_PORT", "9")
    monkeypatch.setenv("WEKNORA_BASE_URL", "http://weknora.test")
    monkeypatch.setenv("ACCESS_COOKIE_SECURE", "false")
    reset_engine()
    Base.metadata.create_all(get_engine())
    application = create_app()
    fake = FakeWeKnora()
    application.dependency_overrides[get_client] = lambda: fake
    with TestClient(application) as client:
        yield client, fake
    reset_engine()
