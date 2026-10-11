"""DEV-ONLY backend with a STUBBED LLM step, for building/screenshotting the UI without an API key.

What is real:  upload checks, text-layer extraction, Tesseract OCR, validation, PostgreSQL storage.
What is fake:  the "LLM": a regex parser that understands only the synthetic layout produced by
               tests/samples/generate_samples.py. It is NOT used by the product or the Docker image.

Run from the project root (needs the Postgres from `docker compose up -d db` and a migrated DB):

    python scripts/stub_llm_server.py            # serves on http://localhost:8000
"""
from __future__ import annotations

import os
import re
import sys
import time
from decimal import Decimal
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import uvicorn  # noqa: E402

from app.api.invoices import get_invoice_extractor  # noqa: E402
from app.main import app  # noqa: E402
from app.schemas.extraction import ExtractedInvoice, LineItem  # noqa: E402
from app.services.llm_extraction import LlmExtractionResult  # noqa: E402


def _find(pattern: str, text: str) -> Optional[str]:
    match = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
    return match.group(1).strip() if match else None


def _dec(value: Optional[str]) -> Optional[Decimal]:
    return Decimal(value) if value else None


class StubExtractor:
    def extract(self, text: str) -> LlmExtractionResult:
        # STUB_DELAY (seconds) makes the "AI" step visibly slow, handy for looking at the progress UI.
        time.sleep(float(os.environ.get("STUB_DELAY", "0")))
        lines = []
        for row in re.finditer(r"^(?P<d>[A-Za-z][\w ]*?)\s+(?P<q>\d+)\s+(?P<p>\d+\.\d+)\s+(?P<t>\d+\.\d+)\s*$", text, re.MULTILINE):
            if row["d"].strip().lower() == "description":
                continue
            lines.append(
                LineItem(description=row["d"].strip(), quantity=_dec(row["q"]), unit_price=_dec(row["p"]), line_total=_dec(row["t"]))
            )
        invoice = ExtractedInvoice(
            vendor_name=text.strip().splitlines()[0].strip() if text.strip() else None,
            invoice_number=_find(r"Invoice number:\s*(\S+)", text),
            invoice_date=_find(r"Invoice date:\s*(\S+)", text),
            due_date=_find(r"Due date:\s*(\S+)", text),
            currency=_find(r"Currency:\s*(\S+)", text),
            line_items=lines,
            subtotal=_dec(_find(r"Subtotal:\s*([\d.]+)", text)),
            tax=_dec(_find(r"VAT[^:]*:\s*([\d.]+)", text)),
            total=_dec(_find(r"^Total:\s*([\d.]+)", text)),
        )
        return LlmExtractionResult(
            invoice=invoice, model_name="STUB (no real LLM)", prompt_tokens=None, completion_tokens=None, latency_ms=0.0
        )


app.dependency_overrides[get_invoice_extractor] = lambda: StubExtractor()

if __name__ == "__main__":
    print("!! STUB LLM server: results come from a regex parser, not from OpenAI !!")
    uvicorn.run(app, host=os.environ.get("STUB_HOST", "127.0.0.1"), port=8000)
