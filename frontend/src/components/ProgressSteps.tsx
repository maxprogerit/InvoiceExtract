import { STEP_ORDER, type ExtractionMethod, type StepName } from '../api/types'
import { methodLabel } from '../lib/format'
import { CheckIcon, Spinner } from './Icons'

interface Props {
  fileName: string
  uploadPercent: number
  /** Latest stage the server reported, or null while the file is still being sent. */
  step: StepName | null
  extractionMethod: ExtractionMethod | null
  onCancel: () => void
}

interface Row {
  key: string
  active: string
  done: string
}

// Rows follow the real pipeline order. A row is only "active" when the server (or the browser, for
// the upload) reports that stage: there are no timers faking progress.
function buildRows(uploadPercent: number, method: ExtractionMethod | null): Row[] {
  return [
    { key: 'upload', active: `Uploading… ${uploadPercent}%`, done: 'File uploaded' },
    { key: 'validating_file', active: 'Checking the file', done: 'File checked' },
    {
      key: 'extracting_text',
      active: 'Extracting text (text layer, or OCR for scans)',
      done: method ? `Text extracted (${methodLabel(method)})` : 'Text extracted',
    },
    { key: 'calling_llm', active: 'Reading the invoice with AI', done: 'Invoice read by AI' },
    { key: 'validating_data', active: 'Checking the numbers', done: 'Numbers checked' },
    { key: 'saving', active: 'Saving the result', done: 'Result saved' },
  ]
}

export function ProgressSteps({ fileName, uploadPercent, step, extractionMethod, onCancel }: Props) {
  const rows = buildRows(uploadPercent, extractionMethod)
  const activeIndex = step === null ? 0 : 1 + STEP_ORDER.indexOf(step)
  const current = rows[activeIndex]

  return (
    <section
      aria-label="Processing"
      className="animate-in rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">Processing invoice</h2>
          <p className="truncate text-sm text-slate-600 dark:text-slate-400" title={fileName}>
            {fileName}
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-100 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800"
        >
          Cancel
        </button>
      </div>

      {/* Screen readers hear each stage change; sighted users see the list below. */}
      <p role="status" aria-live="polite" className="sr-only">
        {current?.active}
      </p>

      <ol className="mt-5 space-y-3">
        {rows.map((row, index) => {
          const state = index < activeIndex ? 'done' : index === activeIndex ? 'active' : 'pending'
          return (
            <li key={row.key} className="flex items-center gap-3 text-sm" aria-current={state === 'active' ? 'step' : undefined}>
              <span
                className={`flex size-6 items-center justify-center rounded-full ${
                  state === 'done'
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                    : state === 'active'
                      ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                      : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
                }`}
              >
                {state === 'done' ? <CheckIcon /> : state === 'active' ? <Spinner /> : <span className="size-1.5 rounded-full bg-current" />}
              </span>
              <span
                className={
                  state === 'pending'
                    ? 'text-slate-500 dark:text-slate-500'
                    : state === 'active'
                      ? 'font-medium'
                      : 'text-slate-700 dark:text-slate-300'
                }
              >
                {state === 'done' ? row.done : row.active}
                <span className="sr-only">{state === 'pending' ? ' (waiting)' : ''}</span>
              </span>
            </li>
          )
        })}
      </ol>

      {step === null && (
        <div
          className="mt-5 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
          role="progressbar"
          aria-label="Upload progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={uploadPercent}
        >
          <div className="h-full bg-indigo-600 transition-[width] dark:bg-indigo-400" style={{ width: `${uploadPercent}%` }} />
        </div>
      )}
    </section>
  )
}
