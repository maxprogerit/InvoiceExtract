from __future__ import annotations

import csv
import io
from decimal import Decimal

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import LlmNotConfiguredError, LlmUpstreamError
from app.models.invoice import Invoice
from tests.conftest import AUTH, requires_tesseract
from tests.invoice_factory import line, make_invoice

D = Decimal


def upload(client, sample_bytes, name="invoice_text.pdf", content_type="application/pdf", headers=AUTH):
    return client.post("/invoices", files={"file": (name, sample_bytes(name), content_type)}, headers=headers)


def row_count(db_engine) -> int:
    with Session(db_engine) as s:
        return s.scalar(select(func.count()).select_from(Invoice))


# ---- auth -------------------------------------------------------------------------------------


@pytest.mark.parametrize("headers", [{}, {"X-API-Key": "wrong"}, {"X-API-Key": ""}])
def test_requests_without_valid_api_key_are_rejected(client, sample_bytes, headers):
    response = upload(client, sample_bytes, headers=headers)
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"


@pytest.mark.parametrize("path", ["/invoices", "/invoices/00000000-0000-0000-0000-000000000000",
                                  "/invoices/00000000-0000-0000-0000-000000000000/export.csv"])
def test_every_invoice_endpoint_requires_the_key(client, path):
    assert client.get(path).status_code == 401


def test_health_and_docs_are_public(client):
    assert client.get("/docs").status_code == 200
    assert client.get("/openapi.json").status_code == 200


# ---- upload: happy paths ----------------------------------------------------------------------


def test_upload_text_pdf_returns_extracted_data_and_validation(client, sample_bytes, fake_extractor, db_engine):
    response = upload(client, sample_bytes)

    assert response.status_code == 201
    body = response.json()
    assert body["filename"] == "invoice_text.pdf"
    assert body["extraction_method"] == "text_layer"
    assert body["status"] == "valid"
    assert body["validation_issues"] == []
    assert body["duplicate"] is False
    assert body["model_name"] == "fake-model"
    assert (body["prompt_tokens"], body["completion_tokens"]) == (100, 50)
    assert body["extracted_data"]["invoice_number"] == "INV-2026-0042"
    assert body["extracted_data"]["total"] == "419.96"  # money is a string: exact, never a float
    assert len(body["file_hash"]) == 64
    assert "raw_text" not in body
    assert "INV-2026-0042" in fake_extractor.last_text  # the LLM received the real extracted text
    assert row_count(db_engine) == 1


def test_wrong_totals_invoice_is_flagged_needs_review(client, sample_bytes, fake_extractor):
    fake_extractor.invoice = make_invoice(subtotal=D("359.97"), total=D("439.96"))
    body = upload(client, sample_bytes, "invoice_wrong_totals.pdf").json()
    assert body["status"] == "needs_review"
    assert {i["code"] for i in body["validation_issues"]} == {"subtotal_mismatch", "total_mismatch"}


def test_nothing_extractable_is_stored_with_failed_status(client, sample_bytes, fake_extractor):
    fake_extractor.invoice = make_invoice(line_items=[], subtotal=None, tax=None, total=None)
    body = upload(client, sample_bytes).json()
    assert body["status"] == "failed"


@requires_tesseract
def test_upload_image_runs_real_ocr(client, sample_bytes, fake_extractor):
    response = upload(client, sample_bytes, "invoice_scan.png", "image/png")
    assert response.status_code == 201
    assert response.json()["extraction_method"] == "ocr"
    assert "INV-2026-0042" in fake_extractor.last_text


def test_directory_components_are_stripped_from_filename(client, sample_bytes):
    response = client.post(
        "/invoices",
        files={"file": ("..\\..\\etc/evil.pdf", sample_bytes("invoice_text.pdf"), "application/pdf")},
        headers=AUTH,
    )
    assert response.json()["filename"] == "evil.pdf"


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("a\x00b\x07c.pdf", "abc.pdf"),  # httpx percent-encodes control chars, so test the function
        ("C:\\Users\\bob\\inv.pdf", "inv.pdf"),
        ("", "upload"),
        ("   ", "upload"),
        ("x" * 400 + ".pdf", ("x" * 400 + ".pdf")[:255]),
    ],
)
def test_sanitize_filename(raw, expected):
    from app.services.invoice_service import sanitize_filename

    assert sanitize_filename(raw) == expected


# ---- duplicates -------------------------------------------------------------------------------


def test_duplicate_upload_returns_stored_record_without_calling_llm(client, sample_bytes, fake_extractor, db_engine):
    first = upload(client, sample_bytes)
    second = upload(client, sample_bytes)

    assert first.status_code == 201 and second.status_code == 200
    assert second.json()["id"] == first.json()["id"]
    assert second.json()["duplicate"] is True
    assert fake_extractor.calls == 1  # the LLM was not called again
    assert row_count(db_engine) == 1


def test_duplicate_detection_uses_content_not_filename(client, sample_bytes, fake_extractor):
    first = client.post("/invoices", files={"file": ("a.pdf", sample_bytes("invoice_text.pdf"), "application/pdf")}, headers=AUTH)
    second = client.post("/invoices", files={"file": ("b.pdf", sample_bytes("invoice_text.pdf"), "application/pdf")}, headers=AUTH)
    assert second.json()["id"] == first.json()["id"] and fake_extractor.calls == 1


def test_different_files_are_not_duplicates(client, sample_bytes, fake_extractor, db_engine):
    upload(client, sample_bytes, "invoice_text.pdf")
    upload(client, sample_bytes, "invoice_wrong_totals.pdf")
    assert fake_extractor.calls == 2 and row_count(db_engine) == 2


def test_race_between_identical_uploads_resolves_to_single_record(client, sample_bytes, fake_extractor, db_engine, monkeypatch):
    """Both requests pass the 'hash not seen yet' check; the UNIQUE constraint lets only one in."""
    upload(client, sample_bytes)  # the "winner" already stored
    from app.repositories.invoice_repository import InvoiceRepository

    real_get_by_hash = InvoiceRepository.get_by_hash
    state = {"first_call": True}

    def racy_get_by_hash(self, file_hash):
        if state["first_call"]:  # simulate: the check ran before the winner committed
            state["first_call"] = False
            return None
        return real_get_by_hash(self, file_hash)

    monkeypatch.setattr(InvoiceRepository, "get_by_hash", racy_get_by_hash)
    response = upload(client, sample_bytes)

    assert response.status_code == 200 and response.json()["duplicate"] is True
    assert fake_extractor.calls == 2  # the loser did pay for its LLM call (documented limitation)
    assert row_count(db_engine) == 1


# ---- upload: rejections -----------------------------------------------------------------------


def test_unsupported_content_is_rejected_by_magic_bytes_not_extension(client):
    response = client.post(
        "/invoices", files={"file": ("invoice.pdf", b"MZ not really a pdf", "application/pdf")}, headers=AUTH
    )
    assert response.status_code == 415
    error = response.json()["error"]
    assert error["code"] == "unsupported_file_type" and error["request_id"]


def test_oversized_upload_is_rejected(client):
    from app.core.config import get_settings
    from app.main import app

    small = get_settings().model_copy(update={"max_upload_mb": 1})
    app.dependency_overrides[get_settings] = lambda: small
    big = b"%PDF-1.4\n" + b"0" * (1024 * 1024 + 10)
    response = client.post("/invoices", files={"file": ("big.pdf", big, "application/pdf")}, headers=AUTH)
    assert response.status_code == 413


def test_missing_file_part_is_422(client):
    assert client.post("/invoices", headers=AUTH).status_code == 422


def test_unreadable_document_is_422_and_not_stored(client, fake_extractor, db_engine):
    corrupt_pdf = b"%PDF-1.7\n" + b"garbage" * 40
    response = client.post("/invoices", files={"file": ("x.pdf", corrupt_pdf, "application/pdf")}, headers=AUTH)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "unreadable_document"
    assert fake_extractor.calls == 0 and row_count(db_engine) == 0


# ---- LLM failures -----------------------------------------------------------------------------


def test_llm_failure_maps_to_502_with_clean_body_and_nothing_stored(client, sample_bytes, fake_extractor, db_engine):
    fake_extractor.error = LlmUpstreamError("The LLM provider timed out")
    response = upload(client, sample_bytes)

    assert response.status_code == 502
    assert response.json()["error"]["code"] == "llm_upstream_error"
    assert "Traceback" not in response.text
    assert row_count(db_engine) == 0  # a retry will not be mistaken for a duplicate


def test_missing_openai_key_gives_503(client, sample_bytes, fake_extractor):
    fake_extractor.error = LlmNotConfiguredError("OPENAI_API_KEY is not configured on the server")
    response = upload(client, sample_bytes)
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "llm_not_configured"


def test_unexpected_exception_returns_generic_500_without_details(client, sample_bytes, fake_extractor):
    fake_extractor.error = RuntimeError("secret internal detail: db password=hunter2")
    response = upload(client, sample_bytes)
    assert response.status_code == 500
    assert response.json()["error"]["code"] == "internal_error"
    assert "hunter2" not in response.text and "Traceback" not in response.text
    assert response.headers["X-Request-ID"] == response.json()["error"]["request_id"]


# ---- read endpoints ---------------------------------------------------------------------------


def test_get_by_id_roundtrips_stored_data(client, sample_bytes):
    created = upload(client, sample_bytes).json()
    fetched = client.get(f"/invoices/{created['id']}", headers=AUTH)
    assert fetched.status_code == 200
    body = fetched.json()
    assert body["extracted_data"] == created["extracted_data"]
    assert body["created_at"] and body["duplicate"] is False


def test_get_unknown_id_is_404_and_malformed_id_is_422(client):
    assert client.get("/invoices/00000000-0000-0000-0000-000000000000", headers=AUTH).status_code == 404
    assert client.get("/invoices/not-a-uuid", headers=AUTH).status_code == 422


def test_list_filters_by_status_and_paginates(client, sample_bytes, fake_extractor):
    upload(client, sample_bytes, "invoice_text.pdf")  # valid
    fake_extractor.invoice = make_invoice(total=D("1.00"))
    upload(client, sample_bytes, "invoice_wrong_totals.pdf")  # needs_review

    everything = client.get("/invoices", headers=AUTH).json()
    assert everything["total"] == 2 and len(everything["items"]) == 2

    review = client.get("/invoices?status=needs_review", headers=AUTH).json()
    assert review["total"] == 1 and review["items"][0]["status"] == "needs_review"

    page = client.get("/invoices?limit=1&offset=1", headers=AUTH).json()
    assert page["total"] == 2 and len(page["items"]) == 1 and page["offset"] == 1
    first_page = client.get("/invoices?limit=1&offset=0", headers=AUTH).json()
    assert page["items"][0]["id"] != first_page["items"][0]["id"]


@pytest.mark.parametrize("query", ["status=bogus", "limit=0", "limit=101", "offset=-1"])
def test_list_rejects_invalid_query_params(client, query):
    assert client.get(f"/invoices?{query}", headers=AUTH).status_code == 422


# ---- CSV export -------------------------------------------------------------------------------


def test_csv_export_contains_line_items(client, sample_bytes):
    created = upload(client, sample_bytes).json()
    response = client.get(f"/invoices/{created['id']}/export.csv", headers=AUTH)

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert f"invoice-{created['id']}.csv" in response.headers["content-disposition"]
    rows = list(csv.reader(io.StringIO(response.text)))
    assert rows[0] == ["invoice_number", "vendor_name", "currency", "line_no",
                       "description", "quantity", "unit_price", "line_total"]
    assert len(rows) == 4  # header + 3 line items
    assert rows[2] == ["INV-2026-0042", "Acme Test Supplies Ltd", "EUR", "2", "Gadget B", "3", "49.99", "149.97"]


def test_csv_export_neutralises_spreadsheet_formulas(client, sample_bytes, fake_extractor):
    fake_extractor.invoice = make_invoice(
        vendor_name="=HYPERLINK(\"http://evil.test\",\"click\")",
        line_items=[line("+cmd|' /C calc'!A0", "1", "-5.00", "-5.00")],
        subtotal=D("-5.00"), tax=D("0"), total=D("-5.00"),
    )
    created = upload(client, sample_bytes).json()
    rows = list(csv.reader(io.StringIO(client.get(f"/invoices/{created['id']}/export.csv", headers=AUTH).text)))
    assert rows[1][1].startswith("'=")  # vendor
    assert rows[1][4].startswith("'+")  # description
    assert rows[1][6] == "-5.00"        # a genuine negative number stays numeric


def test_csv_export_404(client):
    assert client.get("/invoices/00000000-0000-0000-0000-000000000000/export.csv", headers=AUTH).status_code == 404
