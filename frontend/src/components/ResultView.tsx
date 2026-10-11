import type { Invoice } from '../api/types'
import { csvUrl } from '../api/client'
import { formatDateTime, formatDuration, methodLabel } from '../lib/format'
import { DocumentPreview } from './DocumentPreview'
import { FieldsCard } from './FieldsCard'
import { DownloadIcon, InfoIcon } from './Icons'
import { IssuesList } from './IssuesList'
import { LineItemsTable } from './LineItemsTable'
import { StatusBadge } from './StatusBadge'
import { TotalsCheck } from './TotalsCheck'

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-600 dark:text-slate-400">{label}</dt>
      <dd className="truncate text-sm font-medium tabular-nums">{children}</dd>
    </div>
  )
}

function tokens(invoice: Invoice): string {
  if (invoice.prompt_tokens === null && invoice.completion_tokens === null) return '—'
  return `${invoice.prompt_tokens ?? '—'} in / ${invoice.completion_tokens ?? '—'} out`
}

export function ResultView({ invoice, alreadyProcessed }: { invoice: Invoice; alreadyProcessed: boolean }) {
  const data = invoice.extracted_data

  return (
    <article aria-labelledby="result-title" className="animate-in space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <h2 id="result-title" className="max-w-full truncate text-xl font-semibold" title={invoice.filename}>
            {invoice.filename}
          </h2>
          <StatusBadge status={invoice.status} large />
        </div>
        <a
          href={csvUrl(invoice.id)}
          download
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400"
        >
          <DownloadIcon /> Export CSV
        </a>
      </header>

      {alreadyProcessed && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200"
        >
          <InfoIcon className="mt-0.5" />
          <span>
            <strong>Already processed.</strong> This exact file was uploaded before ({formatDateTime(invoice.created_at)}).
            Showing the stored result; no new AI call was made and nothing was charged.
          </span>
        </p>
      )}

      {invoice.status === 'failed' && (
        <p role="status" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          <strong>No amounts could be extracted.</strong> This may not be an invoice, or the scan is too poor to read.
        </p>
      )}
      {invoice.status === 'needs_review' && (
        <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <strong>Needs a human check.</strong> The data was extracted, but at least one validation rule failed. Problems are
          highlighted below.
        </p>
      )}

      <dl className="grid grid-cols-2 gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-3 lg:grid-cols-6 dark:border-slate-800 dark:bg-slate-900">
        <Meta label="Read via">{methodLabel(invoice.extraction_method)}</Meta>
        <Meta label="Model">{invoice.model_name ?? '—'}</Meta>
        <Meta label="Tokens">{tokens(invoice)}</Meta>
        <Meta label="AI latency">{formatDuration(invoice.llm_latency_ms)}</Meta>
        <Meta label="Total time">{formatDuration(invoice.processing_ms)}</Meta>
        <Meta label="Processed">{formatDateTime(invoice.created_at)}</Meta>
      </dl>

      {/* grid-cols-1 + min-w-0: without them a wide table forces the single column (and the whole
          page) wider than a phone screen. */}
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
        <div className="min-w-0 xl:sticky xl:top-4">
          <DocumentPreview invoice={invoice} />
        </div>
        <div className="min-w-0 space-y-4">
          {data ? (
            <>
              <FieldsCard data={data} issues={invoice.validation_issues} />
              <TotalsCheck data={data} issues={invoice.validation_issues} />
              <LineItemsTable items={data.line_items} issues={invoice.validation_issues} />
            </>
          ) : (
            <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm dark:border-slate-800 dark:bg-slate-900">
              No structured data is stored for this invoice.
            </p>
          )}
          <IssuesList issues={invoice.validation_issues} />
        </div>
      </div>
    </article>
  )
}
