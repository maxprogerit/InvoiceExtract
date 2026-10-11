"""Builders for ExtractedInvoice test data, shared by several test modules."""
from __future__ import annotations

from decimal import Decimal
from typing import Any

from app.schemas.extraction import ExtractedInvoice, LineItem

D = Decimal


def line(desc="Widget", qty="10", price="12.50", total="125.00") -> LineItem:
    return LineItem(
        description=desc,
        quantity=None if qty is None else D(qty),
        unit_price=None if price is None else D(price),
        line_total=None if total is None else D(total),
    )


def make_invoice(**overrides: Any) -> ExtractedInvoice:
    """A fully consistent invoice (matches tests/samples/invoice_text.pdf); override to break it."""
    base = dict(
        vendor_name="Acme Test Supplies Ltd",
        invoice_number="INV-2026-0042",
        invoice_date="2026-03-15",
        due_date="2026-04-14",
        currency="EUR",
        line_items=[
            line("Widget A", "10", "12.50", "125.00"),
            line("Gadget B", "3", "49.99", "149.97"),
            line("Service fee", "1", "75.00", "75.00"),
        ],
        subtotal=D("349.97"),
        tax=D("69.99"),
        total=D("419.96"),
    )
    base.update(overrides)
    return ExtractedInvoice(**base)
