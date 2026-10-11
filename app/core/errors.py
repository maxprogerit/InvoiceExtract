from __future__ import annotations


class InvoiceExtractError(Exception):
    """Base class for all expected (client-facing) failures.

    Services raise these; the API layer maps them to HTTP responses. Services stay HTTP-agnostic.
    `code` is a stable machine-readable identifier, `status_code` the HTTP status it maps to.
    """

    status_code = 500
    code = "internal_error"

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class UnauthorizedError(InvoiceExtractError):
    status_code = 401
    code = "unauthorized"


class NotFoundError(InvoiceExtractError):
    status_code = 404
    code = "not_found"


class UnsupportedFileTypeError(InvoiceExtractError):
    status_code = 415
    code = "unsupported_file_type"


class FileTooLargeError(InvoiceExtractError):
    status_code = 413
    code = "file_too_large"


class TooManyPagesError(InvoiceExtractError):
    status_code = 422
    code = "too_many_pages"


class UnreadableDocumentError(InvoiceExtractError):
    """The file has a valid type but we could not get usable text out of it."""

    status_code = 422
    code = "unreadable_document"


class OcrUnavailableError(InvoiceExtractError):
    """Tesseract is missing or misconfigured on the server (not the client's fault)."""

    status_code = 503
    code = "ocr_unavailable"


class LlmNotConfiguredError(InvoiceExtractError):
    status_code = 503
    code = "llm_not_configured"


class LlmUpstreamError(InvoiceExtractError):
    """OpenAI call failed after retries (timeout, rate limit, 5xx, refusal, unparsable output)."""

    status_code = 502
    code = "llm_upstream_error"
