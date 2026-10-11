import type { ExtractedInvoice, ValidationIssue } from '../api/types'
import { groupThousands } from '../lib/format'

function Row({ label, value, strong = false, bad = false }: { label: string; value: string | null; strong?: boolean; bad?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-6 ${strong ? 'pt-2' : ''}`}>
      <dt className={strong ? 'text-lg font-bold' : 'text-sm text-muted'}>{label}</dt>
      <dd
        className={`tabular-nums ${
          strong ? `text-xl font-bold ${bad ? 'text-bad' : 'text-accent-text'}` : 'text-sm font-medium'
        }`}
      >
        {value === null ? '—' : groupThousands(value)}
      </dd>
    </div>
  )
}

/**
 * Subtotal / tax / total, right-aligned. The total turns red when the backend reported that
 * subtotal + tax does not equal it (the rule itself lives in the backend, not here).
 */
export function Totals({ data, issues }: { data: ExtractedInvoice; issues: ValidationIssue[] }) {
  const totalBad = issues.some((i) => i.code === 'total_mismatch' && i.severity === 'error')
  const currency = data.currency ? ` ${data.currency}` : ''
  return (
    <dl aria-label="Totals" className="ml-auto mt-4 max-w-xs space-y-1" data-total-bad={totalBad || undefined}>
      <Row label="Subtotal" value={data.subtotal} />
      <Row label="Tax" value={data.tax} />
      <div className="border-t border-line" />
      <Row strong bad={totalBad} label={`Total${currency}`} value={data.total} />
    </dl>
  )
}
