from __future__ import annotations

import io

import fitz
import pytest
from PIL import Image

from app.core.errors import UnreadableDocumentError
from app.services.text_extraction import OCR, TEXT_LAYER, extract_text
from tests.conftest import requires_tesseract


def test_text_pdf_uses_text_layer_without_ocr(sample_bytes, monkeypatch):
    # If OCR were attempted for a text PDF this would blow up: proves the text layer path is used.
    monkeypatch.setattr(
        "app.services.text_extraction.ocr_image",
        lambda *a, **k: pytest.fail("OCR must not run for a PDF with a text layer"),
    )
    result = extract_text(sample_bytes("invoice_text.pdf"), "pdf", ocr_languages="eng")
    assert result.method == TEXT_LAYER
    assert result.page_count == 1
    assert "INV-2026-0042" in result.text
    assert "419.96" in result.text


@requires_tesseract
def test_image_goes_through_real_ocr(sample_bytes):
    result = extract_text(sample_bytes("invoice_scan.png"), "png", ocr_languages="eng")
    assert result.method == OCR
    assert "INV-2026-0042" in result.text
    assert "419.96" in result.text
    assert "Acme" in result.text


@requires_tesseract
def test_scanned_pdf_without_text_layer_falls_back_to_ocr(sample_bytes):
    # Build an image-only PDF (what a scanner produces) from the PNG sample.
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    page.insert_image(page.rect, stream=sample_bytes("invoice_scan.png"))
    data = doc.tobytes()
    doc.close()
    assert fitz.open(stream=data, filetype="pdf")[0].get_text().strip() == ""

    result = extract_text(data, "pdf", ocr_languages="eng")
    assert result.method == OCR
    assert "INV-2026-0042" in result.text


def test_blank_pdf_page_is_unreadable_when_ocr_finds_nothing(monkeypatch):
    monkeypatch.setattr("app.services.text_extraction.ocr_image", lambda *a, **k: "  \n")
    doc = fitz.open()
    doc.new_page()
    data = doc.tobytes()
    doc.close()
    with pytest.raises(UnreadableDocumentError):
        extract_text(data, "pdf", ocr_languages="eng")


def test_corrupt_image_is_unreadable():
    png_header_only = b"\x89PNG\r\n\x1a\n" + b"\x00" * 10
    with pytest.raises(UnreadableDocumentError):
        extract_text(png_header_only, "png", ocr_languages="eng")


def test_oversized_image_is_rejected_before_ocr(monkeypatch):
    monkeypatch.setattr("app.services.text_extraction.MAX_PIXELS", 100)
    buffer = io.BytesIO()
    Image.new("L", (50, 50), 255).save(buffer, format="PNG")
    with pytest.raises(UnreadableDocumentError, match="too large"):
        extract_text(buffer.getvalue(), "png", ocr_languages="eng")


def test_mixed_pdf_ocrs_only_pages_without_text(monkeypatch):
    calls = []
    monkeypatch.setattr(
        "app.services.text_extraction.ocr_image",
        lambda image, languages: calls.append(languages) or "Scanned page content with enough characters",
    )
    doc = fitz.open()
    doc.new_page().insert_text((72, 72), "This page has a real text layer with enough characters")
    doc.new_page()  # blank page => no text layer => OCR
    data = doc.tobytes()
    doc.close()

    result = extract_text(data, "pdf", ocr_languages="eng+rus")
    assert calls == ["eng+rus"]  # exactly one OCR call, for page 2, with the configured languages
    assert result.method == OCR
    assert "real text layer" in result.text and "Scanned page content" in result.text
