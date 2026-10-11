from __future__ import annotations

import json
import logging
import uuid
from functools import lru_cache
from typing import Any, Dict, Iterator, Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Query, Request, Response, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.core.errors import InvoiceExtractError, NotFoundError
from app.core.security import require_api_key
from app.repositories.invoice_repository import InvoiceRepository
from app.schemas.invoice import ErrorResponse, InvoiceListResponse, InvoiceResponse
from app.schemas.validation import InvoiceStatus
from app.services.csv_export import line_items_to_csv
from app.services.invoice_service import InvoiceService, Step
from app.services.llm_extraction import InvoiceExtractor, OpenAIInvoiceExtractor

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/invoices",
    tags=["invoices"],
    dependencies=[Depends(require_api_key)],
    responses={401: {"model": ErrorResponse}},
)


@lru_cache
def _openai_extractor() -> OpenAIInvoiceExtractor:
    # One client for the whole process: it owns the HTTP connection pool.
    return OpenAIInvoiceExtractor.from_settings(get_settings())


class _LazyOpenAIExtractor:
    """Builds the real client on first use, so a missing OPENAI_API_KEY (503) cannot mask a bad
    upload (415/413/422) or a duplicate hit: those are decided before the LLM is ever needed."""

    def extract(self, text: str):
        return _openai_extractor().extract(text)


def get_invoice_extractor() -> InvoiceExtractor:
    """Dependency seam: tests override this with a fake so no network call is ever made."""
    return _LazyOpenAIExtractor()


@router.post(
    "",
    response_model=InvoiceResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload an invoice (PDF/PNG/JPEG) and extract structured data",
    responses={
        200: {"description": "Identical file was uploaded before; the stored result is returned (no LLM call)."},
        413: {"model": ErrorResponse},
        415: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
        502: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
    },
)
def upload_invoice(
    response: Response,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    extractor: InvoiceExtractor = Depends(get_invoice_extractor),
) -> InvoiceResponse:
    # Read at most limit+1 bytes: enough to detect "too large" without buffering a huge upload.
    data = file.file.read(settings.max_upload_bytes + 1)
    result = InvoiceService(db, extractor, settings).process_upload(file.filename or "upload", data)
    if result.duplicate:
        response.status_code = status.HTTP_200_OK
    return InvoiceResponse.from_model(result.invoice, duplicate=result.duplicate)


def _ndjson(event: Dict[str, Any]) -> bytes:
    return (json.dumps(event, separators=(",", ":")) + "\n").encode("utf-8")


@router.post(
    "/stream",
    summary="Same as POST /invoices, but streams pipeline progress as NDJSON",
    description=(
        "Response is `application/x-ndjson`, one JSON object per line:\n\n"
        '- `{"event":"step","step":"validating_file|extracting_text|calling_llm|validating_data|saving", '
        '"detail":{...}}` before each stage\n'
        '- `{"event":"result","duplicate":bool,"invoice":{...}}` as the last line on success\n'
        '- `{"event":"error","status":int,"error":{"code","message","request_id"}}` as the last line on '
        "failure\n\nPipeline errors are reported in-stream (HTTP status stays 200); authentication "
        "and malformed-request errors use normal HTTP statuses."
    ),
    response_class=StreamingResponse,
    responses={200: {"content": {"application/x-ndjson": {}}}},
)
def upload_invoice_stream(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    extractor: InvoiceExtractor = Depends(get_invoice_extractor),
) -> StreamingResponse:
    data = file.file.read(settings.max_upload_bytes + 1)  # read now: the upload is closed after return
    filename = file.filename or "upload"
    request_id = getattr(request.state, "request_id", "-")

    def error_event(status_code: int, code: str, message: str) -> bytes:
        return _ndjson(
            {
                "event": "error",
                "status": status_code,
                "error": {"code": code, "message": message, "request_id": request_id},
            }
        )

    def events() -> Iterator[bytes]:
        try:
            for item in InvoiceService(db, extractor, settings).process_steps(filename, data):
                if isinstance(item, Step):
                    yield _ndjson({"event": "step", "step": item.name, "detail": item.detail})
                else:
                    invoice = InvoiceResponse.from_model(item.invoice, duplicate=item.duplicate)
                    yield _ndjson(
                        {"event": "result", "duplicate": item.duplicate, "invoice": invoice.model_dump(mode="json")}
                    )
        except InvoiceExtractError as exc:
            db.rollback()  # release the advisory lock now rather than when the session closes
            yield error_event(exc.status_code, exc.code, exc.message)
        except Exception:
            db.rollback()
            logger.exception("unhandled exception in streaming upload")
            yield error_event(500, "internal_error", "An unexpected error occurred")

    return StreamingResponse(
        events(),
        media_type="application/x-ndjson",
        # no-store + X-Accel-Buffering: proxies (nginx) must not buffer, or progress arrives all at once
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )


@router.get("", response_model=InvoiceListResponse, summary="List invoices, newest first")
def list_invoices(
    status_filter: Optional[InvoiceStatus] = Query(default=None, alias="status"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> InvoiceListResponse:
    rows, total = InvoiceRepository(db).list(
        status=status_filter.value if status_filter else None, limit=limit, offset=offset
    )
    return InvoiceListResponse(
        items=[InvoiceResponse.from_model(r) for r in rows], total=total, limit=limit, offset=offset
    )


def _get_or_404(db: Session, invoice_id: uuid.UUID):
    invoice = InvoiceRepository(db).get(invoice_id)
    if invoice is None:
        raise NotFoundError(f"Invoice {invoice_id} not found")
    return invoice


@router.get("/{invoice_id}", response_model=InvoiceResponse, responses={404: {"model": ErrorResponse}})
def get_invoice(invoice_id: uuid.UUID, db: Session = Depends(get_db)) -> InvoiceResponse:
    return InvoiceResponse.from_model(_get_or_404(db, invoice_id))


def _content_disposition(filename: str) -> str:
    # ASCII fallback for old clients + RFC 5987 UTF-8 form: header values must be latin-1 safe.
    ascii_name = filename.encode("ascii", "replace").decode("ascii").replace('"', "'").replace("?", "_")
    return f"inline; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(filename)}"


@router.get(
    "/{invoice_id}/file",
    summary="The original uploaded file (for previews)",
    responses={200: {"content": {"application/pdf": {}, "image/png": {}, "image/jpeg": {}}}, 404: {"model": ErrorResponse}},
)
def download_file(invoice_id: uuid.UUID, db: Session = Depends(get_db)) -> Response:
    invoice = _get_or_404(db, invoice_id)
    if invoice.content_type is None or invoice.file_content is None:
        raise NotFoundError("The original file was not stored for this invoice")
    return Response(
        content=invoice.file_content,
        media_type=invoice.content_type,  # set from magic bytes at upload, never from the client
        headers={
            "Content-Disposition": _content_disposition(invoice.filename),
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, max-age=3600",
        },
    )


@router.get(
    "/{invoice_id}/export.csv",
    summary="Download the line items as CSV",
    responses={200: {"content": {"text/csv": {}}}, 404: {"model": ErrorResponse}},
)
def export_csv(invoice_id: uuid.UUID, db: Session = Depends(get_db)) -> Response:
    invoice = InvoiceResponse.from_model(_get_or_404(db, invoice_id))
    return Response(
        content=line_items_to_csv(invoice.extracted_data),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="invoice-{invoice_id}.csv"'},
    )
