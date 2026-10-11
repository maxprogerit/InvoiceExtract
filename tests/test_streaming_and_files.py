from __future__ import annotations

import json
from decimal import Decimal
from typing import List

import pytest

from app.core.errors import LlmUpstreamError
from tests.conftest import AUTH
from tests.invoice_factory import make_invoice

D = Decimal


def events_of(response) -> List[dict]:
    return [json.loads(line) for line in response.text.splitlines() if line.strip()]


def stream_upload(client, sample_bytes, name="invoice_text.pdf", headers=AUTH, data=None):
    payload = data if data is not None else sample_bytes(name)
    return client.post("/invoices/stream", files={"file": (name, payload, "application/pdf")}, headers=headers)


# ---- streaming --------------------------------------------------------------------------------


def test_stream_reports_real_pipeline_steps_then_result(client, sample_bytes):
    response = stream_upload(client, sample_bytes)

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/x-ndjson")
    assert response.headers["x-accel-buffering"] == "no"
    events = events_of(response)
    steps = [e["step"] for e in events if e["event"] == "step"]
    assert steps == ["validating_file", "extracting_text", "calling_llm", "validating_data", "saving"]
    llm_step = next(e for e in events if e.get("step") == "calling_llm")
    assert llm_step["detail"]["extraction_method"] == "text_layer"  # known once extraction really finished

    last = events[-1]
    assert last["event"] == "result" and last["duplicate"] is False
    assert last["invoice"]["status"] == "valid"
    assert last["invoice"]["extracted_data"]["total"] == "419.96"


def test_stream_duplicate_skips_expensive_steps(client, sample_bytes, fake_extractor):
    stream_upload(client, sample_bytes)
    events = events_of(stream_upload(client, sample_bytes))

    assert [e["step"] for e in events if e["event"] == "step"] == ["validating_file"]
    assert events[-1]["event"] == "result" and events[-1]["duplicate"] is True
    assert fake_extractor.calls == 1


@pytest.mark.parametrize(
    "payload,status,code",
    [(b"not a pdf at all", 415, "unsupported_file_type"), (b"%PDF-1.7\n" + b"junk" * 50, 422, "unreadable_document")],
)
def test_stream_reports_validation_errors_as_error_event(client, sample_bytes, payload, status, code):
    events = events_of(stream_upload(client, sample_bytes, data=payload))
    last = events[-1]
    assert last["event"] == "error" and last["status"] == status
    assert last["error"]["code"] == code and last["error"]["request_id"]


def test_stream_llm_failure_is_an_error_event_and_nothing_is_stored(client, sample_bytes, fake_extractor, db_engine):
    fake_extractor.error = LlmUpstreamError("The LLM provider timed out")
    events = events_of(stream_upload(client, sample_bytes))
    assert events[-1]["event"] == "error" and events[-1]["status"] == 502
    assert [e["step"] for e in events if e["event"] == "step"][-1] == "calling_llm"
    assert client.get("/invoices", headers=AUTH).json()["total"] == 0


def test_stream_unexpected_exception_is_generic_error_event(client, sample_bytes, fake_extractor):
    fake_extractor.error = RuntimeError("secret detail password=hunter2")
    events = events_of(stream_upload(client, sample_bytes))
    assert events[-1]["status"] == 500 and "hunter2" not in json.dumps(events)


def test_stream_requires_api_key(client, sample_bytes):
    assert stream_upload(client, sample_bytes, headers={}).status_code == 401


# ---- original file ----------------------------------------------------------------------------


def test_original_file_is_stored_and_served_back_byte_for_byte(client, sample_bytes):
    created = client.post(
        "/invoices", files={"file": ("invoice_text.pdf", sample_bytes("invoice_text.pdf"), "application/pdf")}, headers=AUTH
    ).json()
    assert created["file_available"] is True

    response = client.get(f"/invoices/{created['id']}/file", headers=AUTH)
    assert response.status_code == 200
    assert response.content == sample_bytes("invoice_text.pdf")
    assert response.headers["content-type"] == "application/pdf"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert "invoice_text.pdf" in response.headers["content-disposition"]


def test_served_content_type_comes_from_magic_bytes_not_the_client(client, sample_bytes):
    # A PNG uploaded claiming to be a PDF is served as image/png.
    created = client.post(
        "/invoices", files={"file": ("sneaky.pdf", sample_bytes("invoice_scan.png"), "application/pdf")}, headers=AUTH
    )
    assert created.status_code == 201
    served = client.get(f"/invoices/{created.json()['id']}/file", headers=AUTH)
    assert served.headers["content-type"] == "image/png"


def test_non_ascii_filename_does_not_break_the_download_header(client, sample_bytes):
    created = client.post(
        "/invoices", files={"file": ("счёт №1 \"final\".pdf", sample_bytes("invoice_text.pdf"), "application/pdf")}, headers=AUTH
    ).json()
    response = client.get(f"/invoices/{created['id']}/file", headers=AUTH)
    assert response.status_code == 200
    assert "filename*=UTF-8''" in response.headers["content-disposition"]


def test_file_endpoint_requires_key_and_404s(client):
    path = "/invoices/00000000-0000-0000-0000-000000000000/file"
    assert client.get(path).status_code == 401
    assert client.get(path, headers=AUTH).status_code == 404


def test_response_carries_timings_and_listing_does_not_load_the_blob(client, sample_bytes):
    created = client.post(
        "/invoices", files={"file": ("a.pdf", sample_bytes("invoice_text.pdf"), "application/pdf")}, headers=AUTH
    ).json()
    assert created["processing_ms"] >= 0 and created["llm_latency_ms"] >= 0
    listed = client.get("/invoices", headers=AUTH).json()["items"][0]
    assert listed["file_available"] is True and "file_content" not in listed


# ---- docs switch ------------------------------------------------------------------------------


def test_docs_can_be_disabled(monkeypatch):
    from fastapi.testclient import TestClient

    import app.main as main
    from app.core.config import get_settings

    monkeypatch.setattr(main, "get_settings", lambda: get_settings().model_copy(update={"enable_docs": False}))
    locked_down = TestClient(main.create_app())
    assert locked_down.get("/docs").status_code == 404
    assert locked_down.get("/openapi.json").status_code == 404
