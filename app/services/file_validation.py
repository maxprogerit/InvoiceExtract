from __future__ import annotations

from typing import Optional

import fitz  # PyMuPDF

from app.core.errors import (
    FileTooLargeError,
    TooManyPagesError,
    UnreadableDocumentError,
    UnsupportedFileTypeError,
)

PDF = "pdf"
PNG = "png"
JPG = "jpg"

CONTENT_TYPES = {PDF: "application/pdf", PNG: "image/png", JPG: "image/jpeg"}

_PNG_MAGIC =b"\x89PNG\r\n\x1a\n"
_JPG_MAGIC = b"\xff\xd8\xff"
_PDF_MAGIC = b"%PDF-"


def detect_file_type(data: bytes) -> Optional[str]:
    """Identify the file by its leading bytes. The client-supplied extension/content-type is ignored."""
    if data.startswith(_PDF_MAGIC):
        return PDF
    if data.startswith(_PNG_MAGIC):
        return PNG
    if data.startswith(_JPG_MAGIC):
        return JPG
    return None


def count_pdf_pages(data: bytes) -> int:
    try:
        with fitz.open(stream=data, filetype="pdf") as doc:
            if doc.needs_pass:
                raise UnreadableDocumentError("The PDF is password-protected")
            return doc.page_count
    except UnreadableDocumentError:
        raise
    except Exception as exc:  # PyMuPDF raises several exception types for corrupt files
        raise UnreadableDocumentError("The PDF is corrupt or cannot be opened") from exc


def validate_upload(data: bytes, *, max_bytes: int, max_pdf_pages: int) -> str:
    """Validate raw upload bytes and return the detected type ('pdf' | 'png' | 'jpg')."""
    if len(data) == 0:
        raise UnreadableDocumentError("The uploaded file is empty")
    if len(data) > max_bytes:
        raise FileTooLargeError(f"File exceeds the {max_bytes // (1024 * 1024)} MB limit")

    file_type = detect_file_type(data)
    if file_type is None:
        raise UnsupportedFileTypeError("Only PDF, PNG and JPEG files are supported")

    if file_type == PDF:
        pages = count_pdf_pages(data)
        if pages == 0:
            raise UnreadableDocumentError("The PDF has no pages")
        if pages > max_pdf_pages:
            raise TooManyPagesError(f"PDF has {pages} pages; the limit is {max_pdf_pages}")
    return file_type
