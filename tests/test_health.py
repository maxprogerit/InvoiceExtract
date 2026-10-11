from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.core.database import get_db
from app.main import app


def _client_with_db() -> TestClient:
    engine = create_engine("sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False})

    def override_get_db():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    return TestClient(app)


def test_health_ok_and_request_id_header():
    client = _client_with_db()
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "up"}
    assert response.headers["X-Request-ID"]


def test_health_reuses_incoming_request_id():
    client = _client_with_db()
    response = client.get("/health", headers={"X-Request-ID": "abc-123"})
    assert response.headers["X-Request-ID"] == "abc-123"


def test_health_degraded_when_db_down():
    class BrokenSession:
        def execute(self, *args, **kwargs):
            raise RuntimeError("connection refused")

    def broken_db():
        yield BrokenSession()

    app.dependency_overrides[get_db] = broken_db
    response = TestClient(app).get("/health")
    assert response.status_code == 503
    assert response.json() == {"status": "degraded", "database": "down"}
    app.dependency_overrides.clear()
