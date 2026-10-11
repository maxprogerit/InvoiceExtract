import type { ExtractedInvoice, ValidationIssue } from '../api/types'
import { groupThousands } from '../lib/format'
import { AlertIcon, CheckIcon, InfoIcon } from './Icons'

type CheckState = 'ok' | 'bad' | 'unknown'

function hasCode(issues: ValidationIssue[], code: string): boolean {
  return issues.some((i) => i.code === code && i.severity === 'error')
}

// The verdicts come from the backend's deterministic validation (single source of truth, including
// the 0.01 tolerance). The UI only presents them; it does not redo the arithmetic with floats.
function linesState(data: ExtractedInvoice, issues: ValidationIssue[]): CheckState {
  if (hasCode(issues, 'subtotal_mismatch')) return 'bad'
  const complete = data.line_items.length > 0 && data.line_items.every((l) => l.line_total !== null)
  return complete && data.subtotal !== null ? 'ok' : 'unknown'
}

function totalState(data: ExtractedInvoice, issues: ValidationIssue[]): CheckState {
  if (hasCode(issues, 'total_mismatch')) return 'bad'
  return data.total !== null && (data.subtotal !== null || data.line_items.length > 0) ? 'ok' : 'unknown'
}

const TONE: Record<CheckState, { box: string; text: string; label: string }> = {
  ok: {
    box: 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30',
    text: 'text-emerald-800 dark:text-emerald-300',
    label: 'Matches',
  },
  bad: {
    box: 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30',
    text: 'text-red-800 dark:text-red-300',
    label: 'Does not match',
  },
  unknown: {
    box: 'border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50',
    text: 'text-slate-700 dark:text-slate-300',
    label: 'Cannot be verified',
  },
}

function Verdict({ state }: { state: CheckState }) {
  const Icon = state === 'ok' ? CheckIcon : state === 'bad' ? AlertIcon : InfoIcon
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${TONE[state].text}`}>
      <Icon /> {TONE[state].label}
    </span>
  )
}

function Amount({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="text-center">
      <div className="text-xs text-slate-600 dark:text-slate-400">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value === null ? '—' : groupThousands(value)}</div>
    </div>
  )
}

export function TotalsCheck({ data, issues }: { data: ExtractedInvoice; issues: ValidationIssue[] }) {
  const lines = linesState(data, issues)
  const total = totalState(data, issues)
  const messages = issues.filter((i) => (i.code === 'subtotal_mismatch' || i.code === 'total_mismatch') && i.severity === 'error')
  const currency = data.currency ? ` ${data.currency}` : ''

  return (
    <section
      aria-labelledby="totals-title"
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <h3 id="totals-title" className="mb-4 text-base font-semibold">
        Totals check
      </h3>

      <div className={`rounded-xl border p-4 ${TONE[total].box}`}>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2" role="group" aria-label="Subtotal plus tax equals total">
          <Amount label="Subtotal" value={data.subtotal} />
          <span aria-hidden="true" className="text-xl text-slate-500">+</span>
          <Amount label="Tax" value={data.tax} />
          <span aria-hidden="true" className="text-xl text-slate-500">=</span>
          <Amount label={`Total${currency}`} value={data.total} />
        </div>
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-current/10 pt-3">
          <span className="text-sm">Subtotal + tax = total</span>
          <Verdict state={total} />
        </div>
      </div>

      <div className={`mt-3 flex items-center justify-between gap-2 rounded-xl border px-4 py-3 ${TONE[lines].box}`}>
        <span className="text-sm">Line items add up to the subtotal</span>
        <Verdict state={lines} />
      </div>

      {messages.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm text-red-800 dark:text-red-300">
          {messages.map((m, i) => (
            <li key={i}>{m.message}</li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-slate-600 dark:text-slate-400">
        Checked by plain code with exact decimals (tolerance 0.01), not by the AI.
      </p>
    </section>
  )
}
