import type { InvoiceStatus } from '../api/types'

/** Text colour class for a status (semantic tokens from index.css). */
export const STATUS_TEXT: Record<InvoiceStatus, string> = {
  valid: 'text-ok',
  needs_review: 'text-warn',
  failed: 'text-bad',
}

export const STATUS_LABEL: Record<InvoiceStatus, string> = {
  valid: 'Valid',
  needs_review: 'Needs review',
  failed: 'Failed',
}
