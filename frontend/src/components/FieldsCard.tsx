import { useId } from 'react'
import type { ExtractedInvoice, ValidationIssue } from '../api/types'
import { groupThousands } from '../lib/format'
import { issuesForField } from '../lib/issues'
import { AlertIcon } from './Icons'

const FIELD_NAMES = [
  'vendor_name',
  'invoice_number',
  'invoice_date',
  'due_date',
  'currency',
  'subtotal',
  'tax',
  'total',
] as const

interface FieldProps {
  label: string
  value: string | null
  issues: ValidationIssue[]
  numeric?: boolean
  wide?: boolean
}

// Read-only inputs: they look like form fields (and can be focused and copied), but nothing is
// editable because the API has no update endpoint. Problems are shown next to the value.
function Field({ label, value, issues, numeric = false, wide = false }: FieldProps) {
  const id = useId()
  const hasError = issues.some((i) => i.severity === 'error')
  const hasWarning = !hasError && issues.length > 0
  const shown = value === null ? '' : numeric ? groupThousands(value) : value

  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
        {label}
      </label>
      <input
        id={id}
        readOnly
        value={shown}
        placeholder="Not found"
        aria-invalid={hasError || undefined}
        aria-describedby={issues.length ? `${id}-issues` : undefined}
        className={`w-full rounded-lg border px-3 py-2 text-sm placeholder:italic placeholder:text-slate-400 dark:placeholder:text-slate-500 ${
          numeric ? 'tabular-nums' : ''
        } ${
          hasError
            ? 'border-red-400 bg-red-50 text-red-950 dark:border-red-700 dark:bg-red-950/40 dark:text-red-100'
            : hasWarning
              ? 'border-amber-400 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100'
              : 'border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60'
        }`}
      />
      {issues.length > 0 && (
        <ul id={`${id}-issues`} className="mt-1 space-y-0.5">
          {issues.map((issue, i) => (
            <li
              key={i}
              className={`flex items-start gap-1.5 text-xs font-medium ${
                issue.severity === 'error' ? 'text-red-700 dark:text-red-400' : 'text-amber-800 dark:text-amber-400'
              }`}
            >
              <AlertIcon className="mt-px size-3.5" />
              <span>
                <span className="sr-only">{issue.severity}: </span>
                {issue.message}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function FieldsCard({ data, issues }: { data: ExtractedInvoice; issues: ValidationIssue[] }) {
  const f = (name: (typeof FIELD_NAMES)[number]) => issuesForField(issues, name)
  return (
    <section
      aria-labelledby="fields-title"
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <h3 id="fields-title" className="mb-4 text-base font-semibold">
        Extracted fields
      </h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field wide label="Vendor" value={data.vendor_name} issues={f('vendor_name')} />
        <Field label="Invoice number" value={data.invoice_number} issues={f('invoice_number')} />
        <Field label="Currency" value={data.currency} issues={f('currency')} />
        <Field label="Invoice date" value={data.invoice_date} issues={f('invoice_date')} />
        <Field label="Due date" value={data.due_date} issues={f('due_date')} />
        <Field numeric label="Subtotal" value={data.subtotal} issues={f('subtotal')} />
        <Field numeric label="Tax" value={data.tax} issues={f('tax')} />
        <Field numeric wide label="Total" value={data.total} issues={f('total')} />
      </div>
    </section>
  )
}
