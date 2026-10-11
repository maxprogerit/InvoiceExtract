import type { ExtractionMethod, Invoice, StepName } from '../api/types'
import { methodLabel } from '../lib/format'
import { CheckIcon, Spinner } from './Icons'
import { STATUS_LABEL, STATUS_TEXT } from '../lib/status'

type ChipState = 'done' | 'active' | 'pending'

function Chip({ label, state }: { label: string; state: ChipState }) {
  const tone =
    state === 'done'
      ? 'border-accent-text/60 text-accent-text'
      : state === 'active'
        ? 'border-fg/40 text-fg'
        : 'border-line text-muted'
  return (
    <li
      aria-current={state === 'active' ? 'step' : undefined}
      className={`inline-flex items-center gap-1.5 rounded-md border bg-bg px-2.5 py-1 font-mono text-xs ${tone}`}
    >
      {state === 'done' && <CheckIcon className="size-3" />}
      {state === 'active' && <Spinner className="size-3" />}
      {label}
      {state === 'pending' && <span className="sr-only"> (waiting)</span>}
    </li>
  )
}

interface RunningProps {
  mode: 'running'
  fileName: string
  uploadPercent: number
  /** Latest stage the server reported, or null while the file is still being sent. */
  step: StepName | null
  extractionMethod: ExtractionMethod | null
  onCancel: () => void
}

interface DoneProps {
  mode: 'done'
  invoice: Invoice
}

// The stages shown as chips. Each is only "active" when the browser (upload) or the server
// (everything else) reports it: there are no timers faking progress.
const STAGE_OF_STEP: Record<StepName, number> = {
  validating_file: 0,
  extracting_text: 1,
  calling_llm: 2,
  validating_data: 3,
  saving: 4,
}

const STATUS_TEXT_OF_STAGE = [
  'Checking the file',
  'Extracting text (text layer, or OCR for scans)',
  'Reading the invoice with AI',
  'Checking the numbers',
  'Saving the result',
]

export function FileCard(props: RunningProps | DoneProps) {
  if (props.mode === 'done') {
    const { invoice } = props
    return (
      <section aria-label="Processed file" className="card animate-in p-5">
        <div className="flex items-center justify-between gap-3">
          <span className="truncate font-mono text-sm font-medium" title={invoice.filename}>
            {invoice.filename}
          </span>
          <span className={`shrink-0 font-mono text-xs font-semibold uppercase tracking-wider ${STATUS_TEXT[invoice.status]}`}>
            {invoice.status === 'valid' ? 'Processed' : STATUS_LABEL[invoice.status]}
          </span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full w-full bg-accent" />
        </div>
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Pipeline stages completed">
          <Chip label={methodLabel(invoice.extraction_method)} state="done" />
          <Chip label="LLM extraction" state="done" />
          <Chip label="Validation" state="done" />
        </ul>
      </section>
    )
  }

  const { fileName, uploadPercent, step, extractionMethod, onCancel } = props
  const active = step === null ? 0 : STAGE_OF_STEP[step]
  const labels = ['Upload', extractionMethod ? methodLabel(extractionMethod) : 'Text / OCR', 'LLM extraction', 'Validation', 'Saved']
  const statusText = step === null ? `Uploading… ${uploadPercent}%` : STATUS_TEXT_OF_STAGE[active]
  // Bar = finished stages (+ the real upload percentage inside the first one).
  const fraction = (active + (step === null ? uploadPercent / 100 : 0)) / labels.length

  return (
    <section aria-label="Processing" className="card animate-in p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="truncate font-mono text-sm font-medium" title={fileName}>
          {fileName}
        </span>
        <button type="button" onClick={onCancel} className="btn !px-2.5 !py-1 !text-xs">
          Cancel
        </button>
      </div>

      <p role="status" aria-live="polite" className="mt-2 font-mono text-xs font-semibold uppercase tracking-wider text-accent-text">
        {statusText}
      </p>

      <div
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-label="Pipeline progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(fraction * 100)}
      >
        <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${fraction * 100}%` }} />
      </div>

      <ol className="mt-3 flex flex-wrap gap-2" aria-label="Pipeline stages">
        {labels.map((label, index) => (
          <Chip key={label} label={label} state={index < active ? 'done' : index === active ? 'active' : 'pending'} />
        ))}
      </ol>
    </section>
  )
}
