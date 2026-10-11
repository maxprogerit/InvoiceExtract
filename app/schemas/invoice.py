from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict

from app.models.invoice import Invoice
from app.schemas.extraction import ExtractedInvoice
from app.schemas.validation import InvoiceStatus, ValidationIssue


class InvoiceResponse(BaseModel):
    # "model_name" collides with Pydantic's protected "model_" prefix; the column is named by the spec.
    model_config = ConfigDict(protected_namespaces=())

    id: uuid.UUID
    filename: str
    file_hash: str
    extraction_method: str
    status: InvoiceStatus
    extracted_data: Optional[ExtractedInvoice]
    validation_issues: List[ValidationIssue]
    model_name: Optional[str]
    prompt_tokens: Optional[int]
    completion_tokens: Optional[int]
    processing_ms: Optional[int]  # whole pipeline (OCR + LLM + validation + save)
    llm_latency_ms: Optional[int]  # the OpenAI call only
    # True when the original upload is stored and downloadable via GET /invoices/{id}/file.
    file_available: bool
    content_type: Optional[str]  # application/pdf | image/png | image/jpeg (from magic bytes)
    created_at: datetime
    # True when this upload matched an already-processed file and no new LLM call was made.
    duplicate: bool = False

    @classmethod
    def from_model(cls, invoice: Invoice, *, duplicate: bool = False) -> "InvoiceResponse":
        # raw_text is deliberately not exposed: it can be large and contains the full document.
        return cls(
            id=invoice.id,
            filename=invoice.filename,
            file_hash=invoice.file_hash,
            extraction_method=invoice.extraction_method,
            status=InvoiceStatus(invoice.status),
            extracted_data=(
                ExtractedInvoice.model_validate(invoice.extracted_json) if invoice.extracted_json else None
            ),
            validation_issues=[ValidationIssue.model_validate(i) for i in (invoice.validation_issues or [])],
            model_name=invoice.model_name,
            prompt_tokens=invoice.prompt_tokens,
            completion_tokens=invoice.completion_tokens,
            processing_ms=invoice.processing_ms,
            llm_latency_ms=invoice.llm_latency_ms,
            # content_type is a plain column; checking file_content would load the deferred blob
            file_available=invoice.content_type is not None,
            content_type=invoice.content_type,
            created_at=invoice.created_at,
            duplicate=duplicate,
        )


class InvoiceListResponse(BaseModel):
    items: List[InvoiceResponse]
    total: int
    limit: int
    offset: int


class ErrorBody(BaseModel):
    code: str
    message: str
    request_id: str


class ErrorResponse(BaseModel):
    error: ErrorBody
