import type { ValidationIssue } from '../api/types'

export function issuesForField(issues: readonly ValidationIssue[], field: string): ValidationIssue[] {
  return issues.filter((i) => i.field === field)
}

/** Issues attached to line item `index`, whether on the row itself or on one of its cells. */
export function issuesForLine(issues: readonly ValidationIssue[], index: number): ValidationIssue[] {
  const prefix = `line_items[${index}]`
  return issues.filter((i) => i.field === prefix || i.field.startsWith(`${prefix}.`))
}

export function hasError(issues: readonly ValidationIssue[]): boolean {
  return issues.some((i) => i.severity === 'error')
}

/** Issues that are not shown next to a field or a line item, so they need a place in the summary. */
export function unattachedIssues(
  issues: readonly ValidationIssue[],
  visibleFields: readonly string[],
): ValidationIssue[] {
  return issues.filter((i) => !visibleFields.includes(i.field) && !i.field.startsWith('line_items['))
}

export const TOTALS_CODES = ['subtotal_mismatch', 'total_mismatch'] as const
