from __future__ import annotations

import pytest

from tests.conftest import AUTH


@pytest.fixture
def client_without_llm(db_engine, monkeypatch):
    """Real extractor wiring (no override) with no OPENAI_API_KEY configured."""
    from fastapi.testclient import TestClient
    from sqlalchemy.orm import Session

    from app.api import invoices
    from app.core.config import get_settings
    from app.core.database import get_db
    from app.main import app

    invoices._openai_extractor.cache_clear()
    no_key = get_settings().model_copy(update={"openai_api_key": None})
    monkeypatch.setattr(invoices, "get_settings", lambda: no_key)

    def override_get_db():
        with Session(db_engine, expire_on_commit=False) as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()
    invoices._openai_extractor.cache_clear()


def test_bad_upload_is_rejected_before_llm_configuration_matters(client_without_llm):
    response = client_without_llm.post(
        "/invoices", files={"file": ("x.pdf", b"not a pdf", "application/pdf")}, headers=AUTH
    )
    assert response.status_code == 415  # not 503


def test_valid_upload_without_key_reports_503(client_without_llm, sample_bytes):
    response = client_without_llm.post(
        "/invoices", files={"file": ("a.pdf", sample_bytes("invoice_text.pdf"), "application/pdf")}, headers=AUTH
    )
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "llm_not_configured"
