import { useId, useRef, useState, type KeyboardEvent } from 'react'
import type { ExtractedInvoice, Invoice, ValidationIssue } from '../api/types'
import { formatDateTime, formatDuration, methodLabel } from '../lib/format'
import { issuesForField } from '../lib/issues'
import { invoiceJson } from '../lib/json'
import { Checks } from './Checks'
import { AlertIcon } from './Icons'
import { ItemsTable } from './ItemsTable'
import { JsonView } from './JsonView'
import { StatusBadge } from './StatusBadge'
import { Totals } from './Totals'

type Tab = 'fields' | 'json'
const TABS: { id: Tab; label: string }[] = [
  { id: 'fields', label: 'Fields' },
  { id: 'json', label: 'JSON' },
]

function Field({ label, value, issues, wide = false }: { label: string; value: string | null; issues: ValidationIssue[]; wide?: boolean }) {
  const hasError = issues.some((i) => i.severity === 'error')
  return (
    <div className={wide ? 'sm:col-span-2' : ''} data-invalid={hasError || undefined}>
      <dt className="caption">{label}</dt>
      <dd
        className={`mt-1 text-lg font-medium ${
          hasError ? 'text-bad underline decoration-bad/60 decoration-dotted underline-offset-4' : ''
        }`}
      >
        {value === null || value.trim() === '' ? <span className="text-base font-normal italic text-muted">Not found</span> : value}
      </dd>
      {issues.map((issue, i) => (
        <p key={i} className={`mt-1 flex items-start gap-1.5 text-xs font-medium ${issue.severity === 'error' ? 'text-bad' : 'text-warn'}`}>
          <AlertIcon className="mt-px size-3.5" />
          <span>
            <span className="sr-only">{issue.severity}: </span>
            {issue.message}
          </span>
        </p>
      ))}
    </div>
  )
}

function HeaderFields({ data, issues }: { data: ExtractedInvoice; issues: ValidationIssue[] }) {
  const f = (name: string) => issuesForField(issues, name)
  return (
    <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-3">
      <Field label="Vendor" value={data.vendor_name} issues={f('vendor_name')} />
      <Field label="Invoice number" value={data.invoice_number} issues={f('invoice_number')} />
      <Field label="Date" value={data.invoice_date} issues={f('invoice_date')} />
      <Field label="Currency" value={data.currency} issues={f('currency')} />
      <Field label="Due date" value={data.due_date} issues={f('due_date')} />
    </dl>
  )
}

function Meta({ invoice }: { invoice: Invoice }) {
  const tokens =
    invoice.prompt_tokens === null && invoice.completion_tokens === null
      ? '—'
      : `${invoice.prompt_tokens ?? '—'} in / ${invoice.completion_tokens ?? '—'} out`
  const items: [string, string][] = [
    ['Read via', methodLabel(invoice.extraction_method)],
    ['Model', invoice.model_name ?? '—'],
    ['Tokens', tokens],
    ['AI latency', formatDuration(invoice.llm_latency_ms)],
    ['Total time', formatDuration(invoice.processing_ms)],
    ['Processed', formatDateTime(invoice.created_at)],
  ]
  return (
    <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-line pt-5 sm:grid-cols-3">
      {items.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="caption">{label}</dt>
          <dd className="mt-0.5 truncate font-mono text-xs">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function ResultPanel({ invoice }: { invoice: Invoice }) {
  const [tab, setTab] = useState<Tab>('fields')
  const base = useId()
  const refs = useRef<Record<Tab, HTMLButtonElement | null>>({ fields: null, json: null })
  const data = invoice.extracted_data

  // WAI-ARIA tabs: arrow keys move between tabs, only the selected tab is in the tab order.
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    const index = TABS.findIndex((t) => t.id === tab)
    const next =
      e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : (index + (e.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length
    const target = TABS[next]
    if (target) {
      setTab(target.id)
      refs.current[target.id]?.focus()
    }
  }

  return (
    <section aria-label="Extraction result" className="card animate-in p-5 sm:p-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div role="tablist" aria-label="Result view" onKeyDown={onKeyDown} className="inline-flex rounded-lg bg-bg p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[t.id] = el
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`${base}-panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => setTab(t.id)}
              className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ${
                tab === t.id ? 'bg-surface-2 text-fg' : 'text-muted hover:text-fg'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <StatusBadge status={invoice.status} />
      </div>

      <div role="tabpanel" id={`${base}-panel-fields`} aria-labelledby={`${base}-tab-fields`} hidden={tab !== 'fields'}>
        {data ? (
          <>
            <HeaderFields data={data} issues={invoice.validation_issues} />
            <div className="mt-6">
              <ItemsTable items={data.line_items} issues={invoice.validation_issues} />
            </div>
            <Totals data={data} issues={invoice.validation_issues} />
            <Checks data={data} issues={invoice.validation_issues} />
          </>
        ) : (
          <p className="text-sm text-muted">No structured data is stored for this invoice.</p>
        )}
        <Meta invoice={invoice} />
      </div>

      <div role="tabpanel" id={`${base}-panel-json`} aria-labelledby={`${base}-tab-json`} hidden={tab !== 'json'}>
        <JsonView text={invoiceJson(invoice)} />
      </div>
    </section>
  )
}
