import type { Invoice } from '../api/types'
import type { StatusFilter } from '../hooks/useHistory'
import { formatRelative, groupThousands } from '../lib/format'
import { Spinner } from './Icons'
import { StatusBadge } from './StatusBadge'

interface Props {
  items: Invoice[]
  total: number
  loading: boolean
  error: string | null
  filter: StatusFilter
  onFilter: (filter: StatusFilter) => void
  onSelect: (invoice: Invoice) => void
  onLoadMore: () => void
  hasMore: boolean
}

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'valid', label: 'Valid' },
  { value: 'needs_review', label: 'Review' },
  { value: 'failed', label: 'Failed' },
]

function summary(invoice: Invoice): string {
  const d = invoice.extracted_data
  if (!d) return 'No data'
  const who = d.vendor_name ?? 'Unknown vendor'
  const amount = d.total !== null ? ` · ${groupThousands(d.total)}${d.currency ? ` ${d.currency}` : ''}` : ''
  return `${who}${amount}`
}

export function HistoryView({ items, total, loading, error, filter, onFilter, onSelect, onLoadMore, hasMore }: Props) {
  return (
    <section aria-labelledby="history-title" className="card animate-in">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-5">
        <h2 id="history-title" className="text-lg font-semibold">
          Processed invoices <span className="font-mono text-sm font-normal text-muted">({total})</span>
        </h2>
        <div role="radiogroup" aria-label="Filter by status" className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="radio"
              aria-checked={filter === f.value}
              onClick={() => onFilter(f.value)}
              className={`rounded-md border px-3 py-1 font-mono text-xs font-medium ${
                filter === f.value
                  ? 'border-accent bg-accent text-accent-fg'
                  : 'border-line text-muted hover:bg-surface-2 hover:text-fg'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p role="alert" className="m-5 rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}

      <ul className="divide-y divide-line">
        {items.map((invoice) => (
          <li key={invoice.id}>
            <button
              type="button"
              onClick={() => onSelect(invoice)}
              className="grid w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-5 py-3.5 text-left hover:bg-surface-2"
            >
              <span className="truncate font-mono text-sm font-medium" title={invoice.filename}>
                {invoice.filename}
              </span>
              <StatusBadge status={invoice.status} />
              <span className="truncate text-sm text-muted">{summary(invoice)}</span>
              <span className="font-mono text-xs text-muted">{formatRelative(invoice.created_at)}</span>
            </button>
          </li>
        ))}
      </ul>

      {!loading && items.length === 0 && !error && (
        <p className="p-5 text-sm text-muted">
          {filter === 'all' ? 'No invoices yet. Upload one on the Extract page.' : 'No invoices with this status.'}
        </p>
      )}

      <div className="p-5 pt-3">
        {loading && (
          <p role="status" className="flex items-center gap-2 text-sm text-muted">
            <Spinner /> Loading…
          </p>
        )}
        {!loading && hasMore && (
          <button type="button" onClick={onLoadMore} className="btn w-full">
            Load more
          </button>
        )}
      </div>
    </section>
  )
}
