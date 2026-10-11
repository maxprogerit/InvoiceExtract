from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import time
from dataclasses import dataclass
from typing import Any, Dict, Iterator, Optional, Union

from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.models.invoice import Invoice
from app.repositories.invoice_repository import InvoiceRepository
from app.services.file_validation import CONTENT_TYPES, validate_upload
from app.services.invoice_validation import validate_invoice
from app.services.llm_extraction import InvoiceExtractor
from app.services.text_extraction import extract_text

logger = logging.getLogger(__name__)

_CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")

# Pipeline step names, reported to clients by the streaming endpoint.
STEP_VALIDATING_FILE = "validating_file"
STEP_EXTRACTING_TEXT = "extracting_text"
STEP_CALLING_LLM = "calling_llm"
STEP_VALIDATING_DATA = "validating_data"
STEP_SAVING = "saving"


@dataclass(frozen=True)
class Step:
    name: str
    detail: Optional[Dict[str, Any]] = None


@dataclass(frozen=True)
class ProcessResult:
    invoice: Invoice
    duplicate: bool


def sanitize_filename(raw: str) -> str:
    """Keep only a safe display name: no directories, no control characters, bounded length."""
    name = os.path.basename((raw or "").replace("\\", "/"))
    name = _CONTROL_CHARS.sub("", name).strip()
    return (name or "upload")[:255]


def _strip_nul(value: Any) -> Any:
    """PostgreSQL rejects NUL characters in TEXT and JSONB; remove them from untrusted content."""
    if isinstance(value, str):
        return value.replace("\x00", "")
    return json.loads(json.dumps(value).replace("\\u0000", ""))


def _ms(seconds: float) -> int:
    return int(round(seconds * 1000))


class InvoiceService:
    def __init__(self, session: Session, extractor: InvoiceExtractor, settings: Settings) -> None:
        self._session = session
        self._repo = InvoiceRepository(session)
        self._extractor = extractor
        self._settings = settings

    def process_upload(self, filename: str, data: bytes) -> ProcessResult:
        """Run the whole pipeline and return the result (progress steps are discarded)."""
        for item in self.process_steps(filename, data):
            if isinstance(item, ProcessResult):
                return item
        raise RuntimeError("pipeline finished without a result")  # unreachable: always yields one

    def process_steps(self, filename: str, data: bytes) -> Iterator[Union[Step, ProcessResult]]:
        """The pipeline as a generator: yields a Step before each stage, and finally a ProcessResult.

        Expected failures surface as InvoiceExtractError raised from the generator.
        """
        started = time.perf_counter()

        yield Step(STEP_VALIDATING_FILE)
        file_type = validate_upload(
            data, max_bytes=self._settings.max_upload_bytes, max_pdf_pages=self._settings.max_pdf_pages
        )

        # Duplicate check happens BEFORE OCR and the LLM call: that is where the cost is.
        file_hash = hashlib.sha256(data).hexdigest()
        self._lock_hash(file_hash)
        existing = self._repo.get_by_hash(file_hash)
        if existing is not None:
            self._session.commit()  # nothing to write; ends the transaction and releases the lock
            logger.info("duplicate upload, returning stored result", extra={"invoice_id": str(existing.id)})
            yield ProcessResult(existing, duplicate=True)
            return

        yield Step(STEP_EXTRACTING_TEXT)
        extraction_started = time.perf_counter()
        extraction = extract_text(data, file_type, ocr_languages=self._settings.ocr_languages)
        extraction_ms = _ms(time.perf_counter() - extraction_started)

        yield Step(STEP_CALLING_LLM, {"extraction_method": extraction.method, "pages": extraction.page_count})
        llm = self._extractor.extract(extraction.text)

        yield Step(STEP_VALIDATING_DATA)
        validation = validate_invoice(llm.invoice)

        yield Step(STEP_SAVING)
        invoice = Invoice(
            filename=sanitize_filename(filename),
            file_hash=file_hash,
            extraction_method=extraction.method,
            status=validation.status.value,
            raw_text=_strip_nul(extraction.text),
            extracted_json=_strip_nul(llm.invoice.model_dump(mode="json")),
            validation_issues=_strip_nul([i.model_dump(mode="json") for i in validation.issues]),
            model_name=llm.model_name,
            prompt_tokens=llm.prompt_tokens,
            completion_tokens=llm.completion_tokens,
            processing_ms=_ms(time.perf_counter() - started),
            llm_latency_ms=int(round(llm.latency_ms)),
            content_type=CONTENT_TYPES[file_type],
            file_content=data,
        )
        try:
            self._repo.add(invoice)
            self._session.commit()
        except IntegrityError:
            # Safety net: with the advisory lock this can only happen on databases without it
            # (or if another writer bypassed the lock). Return the winner's record.
            self._session.rollback()
            winner = self._repo.get_by_hash(file_hash)
            if winner is None:
                raise
            logger.info("concurrent duplicate upload resolved", extra={"invoice_id": str(winner.id)})
            yield ProcessResult(winner, duplicate=True)
            return
        self._session.refresh(invoice)

        logger.info(
            "invoice processed",
            extra={
                "invoice_id": str(invoice.id),
                "extraction_method": extraction.method,
                "pages": extraction.page_count,
                "status": invoice.status,
                "issues": len(validation.issues),
                "model": llm.model_name,
                "prompt_tokens": llm.prompt_tokens,
                "completion_tokens": llm.completion_tokens,
                "extraction_ms": extraction_ms,
                "llm_latency_ms": llm.latency_ms,
                "total_latency_ms": invoice.processing_ms,
            },
        )
        yield ProcessResult(invoice, duplicate=False)

    def _lock_hash(self, file_hash: str) -> None:
        """Serialise concurrent uploads of the *same* file so only one pays for OCR + LLM.

        PostgreSQL transaction-level advisory lock keyed by the file hash: the second request blocks
        here until the first commits, then finds the stored record and returns it as a duplicate.
        Different files take different locks and never wait for each other. The lock is released
        automatically on commit/rollback. Trade-off: the DB connection is held while the pipeline
        runs. Other databases (SQLite in tests) skip this and rely on the UNIQUE constraint.
        """
        if self._session.get_bind().dialect.name != "postgresql":
            return
        key = int.from_bytes(bytes.fromhex(file_hash)[:8], "big", signed=True)
        self._session.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": key})
