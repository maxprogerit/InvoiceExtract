from __future__ import annotations

import fitz
import pytest

from app.core.errors import (
    FileTooLargeError,
    TooManyPagesError,
    UnreadableDocumentError,
    UnsupportedFileTypeError,
)
from app.services.file_validation import detect_file_type, validate_upload

MB = 1024 * 1024


def _pdf_with_pages(n: int) -> bytes:
    doc = fitz.open()
    for i in range(n):
        doc.new_page().insert_text((72, 72), f"page {i + 1} some text")
    data = doc.tobytes()
    doc.close()
    return data


def _validate(data: bytes, max_bytes: int = 10 * MB, max_pages: int = 5) -> str:
    return validate_upload(data, max_bytes=max_bytes, max_pdf_pages=max_pages)


def test_detects_types_by_magic_bytes(sample_bytes):
    assert detect_file_type(sample_bytes("invoice_text.pdf")) == "pdf"
    assert detect_file_type(sample_bytes("invoice_scan.png")) == "png"
    assert detect_file_type(b"\xff\xd8\xff\xe0" + b"\x00" * 20) == "jpg"
    assert detect_file_type(b"GIF89a....") is None


def test_valid_pdf_and_png_accepted(sample_bytes):
    assert _validate(sample_bytes("invoice_text.pdf")) == "pdf"
    assert _validate(sample_bytes("invoice_scan.png")) == "png"


@pytest.mark.parametrize(
    "payload",
    [
        b"MZ\x90\x00 this is a windows executable renamed to invoice.pdf",
        b"<html><script>alert(1)</script></html>",
        b"just some text",
    ],
)
def test_rejects_unknown_content_regardless_of_name(payload):
    # The file name is never consulted: content decides.
    with pytest.raises(UnsupportedFileTypeError):
        _validate(payload)


def test_rejects_empty_file():
    with pytest.raises(UnreadableDocumentError):
        _validate(b"")


def test_rejects_file_over_size_limit():
    big = b"%PDF-1.4\n" + b"0" * (2 * MB)
    with pytest.raises(FileTooLargeError):
        _validate(big, max_bytes=1 * MB)


def test_size_limit_boundary_is_inclusive(sample_bytes):
    data = sample_bytes("invoice_text.pdf")
    assert _validate(data, max_bytes=len(data)) == "pdf"
    with pytest.raises(FileTooLargeError):
        _validate(data, max_bytes=len(data) - 1)


def test_pdf_page_limit():
    assert _validate(_pdf_with_pages(5), max_pages=5) == "pdf"
    with pytest.raises(TooManyPagesError):
        _validate(_pdf_with_pages(6), max_pages=5)


def test_fake_pdf_with_valid_magic_but_garbage_body_is_unreadable():
    with pytest.raises(UnreadableDocumentError):
        _validate(b"%PDF-1.7\n" + b"garbage" * 50)


def test_password_protected_pdf_is_rejected():
    doc = fitz.open()
    doc.new_page().insert_text((72, 72), "secret invoice")
    data = doc.tobytes(encryption=fitz.PDF_ENCRYPT_AES_256, user_pw="pw", owner_pw="pw")
    doc.close()
    with pytest.raises(UnreadableDocumentError, match="password"):
        _validate(data)
