from __future__ import annotations

import csv
import io
from typing import Optional

from app.schemas.extraction import ExtractedInvoice

COLUMNS = [
    "invoice_number",
    "vendor_name",
    "currency",
    "line_no",
    "description",
    "quantity",
    "unit_price",
    "line_total",
]

# Spreadsheet apps treat cells starting with these as formulas (CSV injection). Invoice text is
# attacker-controlled, so text cells get a leading apostrophe, the OWASP-recommended neutraliser.
_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def _text_cell(value: Optional[str]) -> str:
    if value is None:
        return ""
    return "'" + value if value.startswith(_FORMULA_PREFIXES) else value


def _number_cell(value) -> str:
    # Numbers come from Decimal parsing, so they cannot carry a formula; "-5.00" must stay numeric.
    return "" if value is None else format(value, "f")


def line_items_to_csv(invoice: Optional[ExtractedInvoice]) -> str:
    """CSV of the line items; header-only if there is no extracted data."""
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(COLUMNS)
    if invoice is None:
        return buffer.getvalue()
    for number, item in enumerate(invoice.line_items, start=1):
        writer.writerow(
            [
                _text_cell(invoice.invoice_number),
                _text_cell(invoice.vendor_name),
                _text_cell(invoice.currency),
                number,
                _text_cell(item.description),
                _number_cell(item.quantity),
                _number_cell(item.unit_price),
                _number_cell(item.line_total),
            ]
        )
    return buffer.getvalue()
