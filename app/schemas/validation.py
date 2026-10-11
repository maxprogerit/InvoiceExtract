from __future__ import annotations

from enum import Enum
from typing import List

from pydantic import BaseModel


class InvoiceStatus(str, Enum):
    VALID = "valid"
    NEEDS_REVIEW = "needs_review"
    FAILED = "failed"


class Severity(str, Enum):
    ERROR = "error"  # something is wrong or cannot be trusted: forces needs_review
    WARNING = "warning"  # informational (e.g. optional field absent): does not change the status


class ValidationIssue(BaseModel):
    code: str  # stable machine-readable identifier, e.g. "totals_mismatch"
    severity: Severity
    field: str  # e.g. "total" or "line_items[1].line_total"
    message: str


class ValidationResult(BaseModel):
    status: InvoiceStatus
    issues: List[ValidationIssue]
