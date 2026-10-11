"""Schema the LLM must fill in (used as the Structured Outputs format) and the app then validates.

Design notes:
- Money/quantities are Decimal in Python but travel as JSON *strings* ("12.50"): JSON numbers would
  be parsed as binary floats on the way (0.1 + 0.2 problem). The schema override below tells the
  model to emit strings; Pydantic converts them to Decimal.
- Every field is required-but-nullable (OpenAI strict mode forbids optional/default). Missing data
  must be null, never guessed.
- Dates and currency stay plain strings on purpose: a malformed date must surface as a
  deterministic validation issue (status needs_review), not crash the whole extraction.
"""
from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Annotated, Any, List, Optional

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, WithJsonSchema


def _to_decimal(value: Any) -> Any:
    """Normalise model output before Pydantic's Decimal parsing; '' and whitespace mean 'absent'."""
    if value is None:
        return None
    if isinstance(value, float):
        # Never silently accept binary floats: go through repr to get the shortest exact text.
        return Decimal(repr(value))
    if isinstance(value, str):
        cleaned = value.strip()
        if cleaned == "":
            return None
        try:
            parsed = Decimal(cleaned)
        except InvalidOperation:
            return value  # let Pydantic raise a proper validation error
        return parsed if parsed.is_finite() else value
    return value


# Decimal on the Python side, "string or null" in the JSON schema sent to OpenAI.
Number = Annotated[
    Optional[Decimal],
    BeforeValidator(_to_decimal),
    WithJsonSchema({"type": ["string", "null"]}),
]


class LineItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    description: Optional[str] = Field(
        ..., description="Item description exactly as printed, or null if absent."
    )
    quantity: Number = Field(
        ..., description='Quantity as a plain decimal string like "10" or "2.5", or null.'
    )
    unit_price: Number = Field(
        ..., description='Unit price as a plain decimal string like "12.50", or null.'
    )
    line_total: Number = Field(
        ...,
        description='Line total exactly as printed on the document, as a plain decimal string, or null.',
    )


class ExtractedInvoice(BaseModel):
    model_config = ConfigDict(extra="forbid")

    vendor_name: Optional[str] = Field(..., description="Name of the company issuing the invoice, or null.")
    invoice_number: Optional[str] = Field(..., description="Invoice number/identifier as printed, or null.")
    invoice_date: Optional[str] = Field(
        ..., description="Invoice issue date in ISO format YYYY-MM-DD, or null if not stated."
    )
    due_date: Optional[str] = Field(
        ..., description="Payment due date in ISO format YYYY-MM-DD, or null if not stated."
    )
    currency: Optional[str] = Field(
        ...,
        description=(
            "ISO 4217 three-letter code such as EUR or USD. Only if the document states it or the "
            "symbol is unambiguous; otherwise null."
        ),
    )
    line_items: List[LineItem] = Field(..., description="All line items; empty list if none are listed.")
    subtotal: Number = Field(
        ..., description='Subtotal before tax exactly as printed, plain decimal string, or null.'
    )
    tax: Number = Field(
        ..., description='Total tax amount exactly as printed, plain decimal string, or null.'
    )
    total: Number = Field(
        ..., description='Grand total exactly as printed, plain decimal string, or null.'
    )
