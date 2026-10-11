"""Deterministic validation of an extracted invoice. Plain Python + Decimal, no LLM involved.

Status rules:
  failed        - no monetary data at all (no total, no subtotal, no line totals): the document
                  is probably not an invoice or the extraction produced nothing usable.
  needs_review  - at least one ERROR issue (mismatch, invalid value, missing key field).
  valid         - no ERROR issues. WARNING issues (optional data absent) are still reported.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import List, Optional

from app.schemas.extraction import ExtractedInvoice
from app.schemas.validation import InvoiceStatus, Severity, ValidationIssue, ValidationResult

# Absolute tolerance for all money comparisons (rounding on printed invoices).
TOLERANCE = Decimal("0.01")

# Currencies seen on invoices: ISO 4217 active codes without funds/precious-metal/testing codes.
# BGN and HRK are kept although withdrawn in favour of EUR (2026 / 2023): older invoices use them.
ISO_4217_CODES = frozenset(
    """
    AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BRL BSD BTN BWP BYN
    BZD CAD CDF CHF CLP CNY COP CRC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS
    GIP GMD GNF GTQ GYD HKD HNL HRK HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KPW
    KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MYR MZN
    NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK
    SGD SHP SLE SOS SRD SSP STN SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD UYU UZS
    VES VND VUV WST XAF XCD XOF XPF YER ZAR ZMW ZWL
    """.split()
)


def _issue(code: str, severity: Severity, field: str, message: str) -> ValidationIssue:
    return ValidationIssue(code=code, severity=severity, field=field, message=message)


def _error(code: str, field: str, message: str) -> ValidationIssue:
    return _issue(code, Severity.ERROR, field, message)


def _warning(code: str, field: str, message: str) -> ValidationIssue:
    return _issue(code, Severity.WARNING, field, message)


def _differs(a: Decimal, b: Decimal) -> bool:
    return abs(a - b) > TOLERANCE


def _parse_iso_date(value: str) -> Optional[date]:
    try:
        return date.fromisoformat(value.strip())  # strict YYYY-MM-DD only
    except ValueError:
        return None


def _check_required_fields(inv: ExtractedInvoice, issues: List[ValidationIssue]) -> None:
    required = {
        "vendor_name": inv.vendor_name,
        "invoice_number": inv.invoice_number,
        "invoice_date": inv.invoice_date,
        "currency": inv.currency,
        "total": inv.total,
    }
    for name, value in required.items():
        blank = value is None or (isinstance(value, str) and not value.strip())
        if blank:
            issues.append(_error("missing_field", name, f"Required field '{name}' was not found in the document"))

    optional = {"due_date": inv.due_date, "tax": inv.tax, "subtotal": inv.subtotal}
    for name, value in optional.items():
        if value is None or (isinstance(value, str) and not value.strip()):
            issues.append(_warning("missing_optional_field", name, f"Field '{name}' was not found in the document"))
    if not inv.line_items:
        issues.append(_warning("no_line_items", "line_items", "No line items were found in the document"))


def _check_dates(inv: ExtractedInvoice, issues: List[ValidationIssue]) -> None:
    invoice_date = due_date = None
    if inv.invoice_date and inv.invoice_date.strip():
        invoice_date = _parse_iso_date(inv.invoice_date)
        if invoice_date is None:
            issues.append(_error("invalid_date", "invoice_date", f"'{inv.invoice_date}' is not a valid YYYY-MM-DD date"))
    if inv.due_date and inv.due_date.strip():
        due_date = _parse_iso_date(inv.due_date)
        if due_date is None:
            issues.append(_error("invalid_date", "due_date", f"'{inv.due_date}' is not a valid YYYY-MM-DD date"))
    if invoice_date and due_date and due_date < invoice_date:
        issues.append(
            _error("due_before_invoice", "due_date", f"Due date {due_date} is earlier than invoice date {invoice_date}")
        )


def _check_currency(inv: ExtractedInvoice, issues: List[ValidationIssue]) -> None:
    if inv.currency and inv.currency.strip():
        if inv.currency.strip().upper() not in ISO_4217_CODES:
            issues.append(_error("invalid_currency", "currency", f"'{inv.currency}' is not a recognised ISO 4217 code"))


def _check_line_items(inv: ExtractedInvoice, issues: List[ValidationIssue]) -> Optional[Decimal]:
    """Check each line; return the sum of line totals if every line has one, else None."""
    line_totals: List[Decimal] = []
    all_have_total = bool(inv.line_items)
    for index, item in enumerate(inv.line_items):
        prefix = f"line_items[{index}]"
        if item.line_total is None:
            all_have_total = False
            issues.append(_warning("line_item_incomplete", f"{prefix}.line_total", "Line total is missing"))
        else:
            line_totals.append(item.line_total)

        if item.quantity is None or item.unit_price is None:
            if item.line_total is not None:
                issues.append(
                    _warning(
                        "line_item_incomplete",
                        prefix,
                        "Quantity or unit price is missing, so quantity x unit price could not be checked",
                    )
                )
        elif item.line_total is not None:
            expected = item.quantity * item.unit_price
            if _differs(expected, item.line_total):
                issues.append(
                    _error(
                        "line_total_mismatch",
                        f"{prefix}.line_total",
                        f"quantity x unit_price = {expected} but line_total is {item.line_total}",
                    )
                )
    return sum(line_totals, Decimal("0")) if all_have_total else None


def _check_totals(inv: ExtractedInvoice, lines_sum: Optional[Decimal], issues: List[ValidationIssue]) -> None:
    if inv.subtotal is not None and lines_sum is not None and _differs(lines_sum, inv.subtotal):
        issues.append(
            _error(
                "subtotal_mismatch",
                "subtotal",
                f"Sum of line totals is {lines_sum} but subtotal is {inv.subtotal}",
            )
        )

    # Basis for subtotal + tax: the stated subtotal, otherwise the sum of line totals.
    basis = inv.subtotal if inv.subtotal is not None else lines_sum
    if basis is None or inv.total is None:
        return
    tax = inv.tax if inv.tax is not None else Decimal("0")
    expected_total = basis + tax
    if _differs(expected_total, inv.total):
        tax_note = "" if inv.tax is not None else " (tax was not found and is assumed to be 0)"
        issues.append(
            _error(
                "total_mismatch",
                "total",
                f"{'subtotal' if inv.subtotal is not None else 'sum of line totals'} + tax = "
                f"{expected_total}{tax_note} but total is {inv.total}",
            )
        )


def _has_monetary_data(inv: ExtractedInvoice) -> bool:
    return (
        inv.total is not None
        or inv.subtotal is not None
        or any(item.line_total is not None for item in inv.line_items)
    )


def validate_invoice(inv: ExtractedInvoice) -> ValidationResult:
    issues: List[ValidationIssue] = []

    if not _has_monetary_data(inv):
        issues.append(_error("no_monetary_data", "total", "No amounts could be extracted from the document"))
        _check_required_fields(inv, issues)
        return ValidationResult(status=InvoiceStatus.FAILED, issues=issues)

    _check_required_fields(inv, issues)
    _check_dates(inv, issues)
    _check_currency(inv, issues)
    lines_sum = _check_line_items(inv, issues)
    _check_totals(inv, lines_sum, issues)

    has_errors = any(i.severity is Severity.ERROR for i in issues)
    status = InvoiceStatus.NEEDS_REVIEW if has_errors else InvoiceStatus.VALID
    return ValidationResult(status=status, issues=issues)
