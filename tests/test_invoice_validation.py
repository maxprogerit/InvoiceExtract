from __future__ import annotations

from decimal import Decimal
from typing import Any, List

import pytest

from app.schemas.extraction import ExtractedInvoice
from app.schemas.validation import InvoiceStatus, Severity
from app.services.invoice_validation import validate_invoice
from tests.invoice_factory import line, make_invoice as make

D = Decimal


def codes(result, severity=None) -> List[str]:
    return [i.code for i in result.issues if severity is None or i.severity is severity]


# ---- happy path -------------------------------------------------------------------------------


def test_consistent_invoice_is_valid_with_no_issues():
    result = validate_invoice(make())
    assert result.status is InvoiceStatus.VALID
    assert result.issues == []


# ---- tolerance (0.01) -------------------------------------------------------------------------


@pytest.mark.parametrize(
    "total,expected_status",
    [
        (D("419.96"), InvoiceStatus.VALID),
        (D("419.97"), InvoiceStatus.VALID),  # off by exactly 0.01 -> within tolerance
        (D("419.95"), InvoiceStatus.VALID),
        (D("419.98"), InvoiceStatus.NEEDS_REVIEW),  # off by 0.02 -> outside
        (D("419.94"), InvoiceStatus.NEEDS_REVIEW),
    ],
)
def test_total_tolerance_boundary(total, expected_status):
    assert validate_invoice(make(total=total)).status is expected_status


def test_money_math_is_exact_decimal_not_float():
    # With binary floats 0.1 + 0.2 != 0.3 and such errors accumulate; Decimal must not trip here.
    inv = make(
        line_items=[line("a", "1", "0.10", "0.10"), line("b", "1", "0.20", "0.20")],
        subtotal=D("0.30"),
        tax=D("0.00"),
        total=D("0.30"),
    )
    assert validate_invoice(inv).issues == []


# ---- the three arithmetic rules ---------------------------------------------------------------


def test_line_total_mismatch_is_flagged_with_line_index():
    inv = make(
        line_items=[
            line("Widget A", "10", "12.50", "125.00"),
            line("Gadget B", "3", "49.99", "159.97"),  # should be 149.97
            line("Service fee", "1", "75.00", "75.00"),
        ]
    )
    result = validate_invoice(inv)
    mismatches = [i for i in result.issues if i.code == "line_total_mismatch"]
    assert [i.field for i in mismatches] == ["line_items[1].line_total"]
    assert "149.97" in mismatches[0].message
    assert result.status is InvoiceStatus.NEEDS_REVIEW


def test_subtotal_must_equal_sum_of_line_totals():
    result = validate_invoice(make(subtotal=D("359.97"), total=D("429.96")))
    assert "subtotal_mismatch" in codes(result)
    assert "total_mismatch" not in codes(result)  # total is consistent with the stated subtotal+tax
    assert result.status is InvoiceStatus.NEEDS_REVIEW


def test_total_must_equal_subtotal_plus_tax():
    result = validate_invoice(make(total=D("439.96")))
    assert codes(result, Severity.ERROR) == ["total_mismatch"]


def test_wrong_totals_sample_scenario_triggers_both_rules():
    # Mirrors tests/samples/invoice_wrong_totals.pdf: subtotal 359.97, total 439.96.
    result = validate_invoice(make(subtotal=D("359.97"), total=D("439.96")))
    assert set(codes(result, Severity.ERROR)) == {"subtotal_mismatch", "total_mismatch"}
    assert result.status is InvoiceStatus.NEEDS_REVIEW


def test_subtotal_missing_falls_back_to_sum_of_lines():
    ok = validate_invoice(make(subtotal=None))
    assert ok.status is InvoiceStatus.VALID
    assert "missing_optional_field" in codes(ok, Severity.WARNING)

    bad = validate_invoice(make(subtotal=None, total=D("500.00")))
    assert "total_mismatch" in codes(bad)
    assert "sum of line totals" in [i for i in bad.issues if i.code == "total_mismatch"][0].message


def test_tax_missing_is_ok_only_when_total_equals_subtotal():
    no_tax_ok = validate_invoice(make(tax=None, total=D("349.97")))
    assert no_tax_ok.status is InvoiceStatus.VALID
    assert any(i.field == "tax" and i.severity is Severity.WARNING for i in no_tax_ok.issues)

    no_tax_bad = validate_invoice(make(tax=None))  # total still includes the 69.99 tax
    assert no_tax_bad.status is InvoiceStatus.NEEDS_REVIEW
    assert "tax was not found" in [i for i in no_tax_bad.issues if i.code == "total_mismatch"][0].message


def test_incomplete_line_is_a_warning_and_skips_dependent_checks_without_crashing():
    inv = make(
        line_items=[
            line("Widget A", "10", "12.50", "125.00"),
            line("Gadget B", None, None, "149.97"),
            line("Service fee", "1", "75.00", None),
        ],
    )
    result = validate_invoice(inv)
    assert result.status is InvoiceStatus.VALID  # nothing provably wrong, just not fully checkable
    assert codes(result, Severity.WARNING).count("line_item_incomplete") == 2
    assert "subtotal_mismatch" not in codes(result)  # a line total is missing: sum is not computed


# ---- dates ------------------------------------------------------------------------------------


@pytest.mark.parametrize("bad", ["2026-13-45", "15/03/2026", "March 15, 2026", "2026-3-5", "not a date"])
def test_invalid_invoice_date_formats(bad):
    result = validate_invoice(make(invoice_date=bad))
    assert [(i.code, i.field) for i in result.issues if i.severity is Severity.ERROR] == [
        ("invalid_date", "invoice_date")
    ]
    assert result.status is InvoiceStatus.NEEDS_REVIEW


def test_invalid_due_date_format():
    result = validate_invoice(make(due_date="31/04/2026"))
    assert ("invalid_date", "due_date") in [(i.code, i.field) for i in result.issues]


def test_due_date_before_invoice_date_is_flagged():
    result = validate_invoice(make(invoice_date="2026-03-15", due_date="2026-03-14"))
    assert codes(result, Severity.ERROR) == ["due_before_invoice"]


def test_due_date_equal_to_invoice_date_is_allowed():
    assert validate_invoice(make(due_date="2026-03-15")).status is InvoiceStatus.VALID


def test_impossible_calendar_date_is_flagged():
    assert "invalid_date" in codes(validate_invoice(make(invoice_date="2026-02-30")))


# ---- currency ---------------------------------------------------------------------------------


@pytest.mark.parametrize("code", ["EUR", "USD", "GBP", "JPY", "PLN", "eur"])
def test_valid_currency_codes(code):
    assert validate_invoice(make(currency=code)).status is InvoiceStatus.VALID


@pytest.mark.parametrize("code", ["EURO", "EU", "XXX", "US$", "123", "ABC"])
def test_invalid_currency_codes(code):
    result = validate_invoice(make(currency=code))
    assert codes(result, Severity.ERROR) == ["invalid_currency"]
    assert result.status is InvoiceStatus.NEEDS_REVIEW


# ---- missing data -----------------------------------------------------------------------------


@pytest.mark.parametrize("field", ["vendor_name", "invoice_number", "invoice_date", "currency", "total"])
def test_missing_required_field_forces_review(field):
    result = validate_invoice(make(**{field: None}))
    missing = [i for i in result.issues if i.code == "missing_field"]
    assert [i.field for i in missing] == [field]
    assert result.status is InvoiceStatus.NEEDS_REVIEW


def test_blank_string_counts_as_missing():
    result = validate_invoice(make(vendor_name="   "))
    assert ("missing_field", "vendor_name") in [(i.code, i.field) for i in result.issues]


def test_missing_optional_fields_only_warn():
    result = validate_invoice(make(due_date=None))
    assert result.status is InvoiceStatus.VALID
    assert [(i.code, i.field, i.severity) for i in result.issues] == [
        ("missing_optional_field", "due_date", Severity.WARNING)
    ]


def test_no_line_items_warns_but_totals_still_checked():
    result = validate_invoice(make(line_items=[]))
    assert "no_line_items" in codes(result, Severity.WARNING)
    assert result.status is InvoiceStatus.VALID  # subtotal + tax == total still holds


def test_nothing_monetary_extracted_is_failed():
    inv = make(line_items=[], subtotal=None, tax=None, total=None)
    result = validate_invoice(inv)
    assert result.status is InvoiceStatus.FAILED
    assert "no_monetary_data" in codes(result)


def test_completely_empty_extraction_is_failed_and_does_not_crash():
    empty = ExtractedInvoice(
        vendor_name=None, invoice_number=None, invoice_date=None, due_date=None, currency=None,
        line_items=[], subtotal=None, tax=None, total=None,
    )
    result = validate_invoice(empty)
    assert result.status is InvoiceStatus.FAILED
    assert {"missing_field", "no_monetary_data"} <= set(codes(result))


def test_result_is_json_serialisable():
    payload = validate_invoice(make(total=D("1.00"))).model_dump(mode="json")
    assert payload["status"] == "needs_review"
    assert payload["issues"][0]["severity"] == "error"
