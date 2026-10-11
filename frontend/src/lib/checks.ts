import type { ExtractedInvoice, ValidationIssue } from '../api/types'

export type CheckState = 'ok' | 'bad' | 'unknown'

export interface Check {
  id: string
  label: string
  state: CheckState
  /** Backend messages explaining a failed check. */
  messages: string[]
}

function errorsWith(issues: readonly ValidationIssue[], ...codes: string[]): ValidationIssue[] {
  return issues.filter((i) => i.severity === 'error' && codes.includes(i.code))
}

function verdict(failed: ValidationIssue[], canVerify: boolean): CheckState {
  if (failed.length > 0) return 'bad'
  return canVerify ? 'ok' : 'unknown'
}

/**
 * Turn the backend's validation issues into a short checklist for humans.
 *
 * The backend stays the single source of truth for the rules (and the 0.01 tolerance). This only
 * groups its verdicts and says whether a check passed, failed, or could not be run because the
 * document lacked the data ("unknown"), so the UI never redoes money arithmetic itself.
 */
export function buildChecks(data: ExtractedInvoice, issues: readonly ValidationIssue[]): Check[] {
  const lines = data.line_items
  const linesHaveTotals = lines.length > 0 && lines.every((l) => l.line_total !== null)
  const linesHaveMath = lines.every((l) => l.quantity !== null && l.unit_price !== null && l.line_total !== null) && lines.length > 0

  const required = errorsWith(issues, 'missing_field')
  const lineMath = errorsWith(issues, 'line_total_mismatch')
  const subtotal = errorsWith(issues, 'subtotal_mismatch')
  const total = errorsWith(issues, 'total_mismatch')
  const dates = errorsWith(issues, 'invalid_date', 'due_before_invoice')
  const currency = errorsWith(issues, 'invalid_currency')

  const check = (id: string, label: string, failed: ValidationIssue[], canVerify: boolean): Check => ({
    id,
    label,
    state: verdict(failed, canVerify),
    messages: failed.map((i) => i.message),
  })

  return [
    check('required', 'Required fields present', required, true),
    check('line-math', 'Line totals match quantity × price', lineMath, linesHaveMath),
    check('subtotal', 'Line items add up to the subtotal', subtotal, linesHaveTotals && data.subtotal !== null),
    check('total', 'Subtotal + tax = total', total, data.total !== null && (data.subtotal !== null || linesHaveTotals)),
    check('dates', 'Dates are valid (due date not before invoice date)', dates, data.invoice_date !== null),
    check('currency', 'Currency recognised', currency, data.currency !== null),
  ]
}

/** Warnings are informational (e.g. an optional field is absent); they do not affect the status. */
export function notes(issues: readonly ValidationIssue[]): ValidationIssue[] {
  return issues.filter((i) => i.severity === 'warning')
}
