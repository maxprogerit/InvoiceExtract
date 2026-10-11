import { useState } from 'react'
import type { Invoice, InvoiceStatus } from '../api/types'
import { groupThousands, formatRelative } from '../lib/format'
import { Spinner } from './Icons'
import { StatusBadge } from './StatusBadge'
import type { StatusFilter } from '../hooks/useHistory'

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
  selectedId: string | null
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

export function HistoryPanel(props: Props) {
  const { items, total, loading, error, filter, onFilter, onSelect, onLoadMore, hasMore, selectedId } = props
  const [open, setOpen] = useState(false)

  return (
    <section aria-labelledby="history-title" className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-2 px-4 pt-4">
        <h2 id="history-title" className="text-base font-semibold">
          History <span className="font-normal text-slate-600 dark:text-slate-400">({total})</span>
        </h2>
        {/* On small screens the list is collapsed by default; from lg up it is always visible. */}
        <button
          type="button"
          className="rounded-lg px-2.5 py-1 text-sm font-medium ring-1 ring-slate-300 hover:bg-slate-100 lg:hidden dark:ring-slate-700 dark:hover:bg-slate-800"
          aria-expanded={open}
          aria-controls="history-body"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? 'Hide' : 'Show'}
        </button>
      </div>

      <div id="history-body" className={`${open ? 'block' : 'hidden'} lg:block`}>
        <div role="radiogroup" aria-label="Filter by status" className="flex gap-1 px-4 pt-3">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="radio"
              aria-checked={filter === f.value}
              onClick={() => onFilter(f.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${
                filter === f.value
                  ? 'bg-indigo-600 text-white ring-indigo-600 dark:bg-indigo-500 dark:ring-indigo-500'
                  : 'text-slate-700 ring-slate-300 hover:bg-slate-100 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {error && (
          <p role="alert" className="mx-4 mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        )}

        <ul className="mt-3 max-h-[60vh] divide-y divide-slate-100 overflow-y-auto px-2 pb-2 dark:divide-slate-800">
          {items.map((invoice) => {
            const selected = invoice.id === selectedId
            return (
              <li key={invoice.id}>
                <button
                  type="button"
                  onClick={() => onSelect(invoice)}
                  aria-current={selected ? 'true' : undefined}
                  className={`flex w-full flex-col gap-1 rounded-lg px-2 py-2.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800 ${
                    selected ? 'bg-indigo-50 dark:bg-indigo-950/40' : ''
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium" title={invoice.filename}>
                      {invoice.filename}
                    </span>
                    <StatusBadge status={invoice.status as InvoiceStatus} />
                  </span>
                  <span className="truncate text-xs text-slate-600 dark:text-slate-400">{summary(invoice)}</span>
                  <span className="text-xs text-slate-500">{formatRelative(invoice.created_at)}</span>
                </button>
              </li>
            )
          })}
        </ul>

        {!loading && items.length === 0 && !error && (
          <p className="px-4 pb-5 text-sm text-slate-600 dark:text-slate-400">
            {filter === 'all' ? 'No invoices yet. Upload one to get started.' : 'No invoices with this status.'}
          </p>
        )}

        <div className="px-4 pb-4">
          {loading && (
            <p role="status" className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <Spinner /> Loading…
            </p>
          )}
          {!loading && hasMore && (
            <button
              type="button"
              onClick={onLoadMore}
              className="w-full rounded-lg px-3 py-2 text-sm font-medium ring-1 ring-slate-300 hover:bg-slate-100 dark:ring-slate-700 dark:hover:bg-slate-800"
            >
              Load more
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
