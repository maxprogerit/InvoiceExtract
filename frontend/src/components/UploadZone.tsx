import { useId, useState, type ChangeEvent, type DragEvent } from 'react'
import { ACCEPT, MAX_UPLOAD_MB, checkFile } from '../lib/files'
import { AlertIcon, UploadIcon } from './Icons'

interface Props {
  onFile: (file: File) => void
  disabled: boolean
  compact: boolean
}

export function UploadZone({ onFile, disabled, compact }: Props) {
  const inputId = useId()
  const errorId = useId()
  const [dragging, setDragging] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  async function accept(file: File | undefined) {
    if (!file) return
    const issue = await checkFile(file)
    setProblem(issue)
    if (!issue) onFile(file)
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    void accept(e.target.files?.[0])
    e.target.value = '' // allow selecting the same file again
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault()
    setDragging(false)
    if (!disabled) void accept(e.dataTransfer.files[0])
  }

  function onDragOver(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault()
    if (!disabled) setDragging(true)
  }

  return (
    <section aria-label="Upload an invoice">
      <label
        htmlFor={inputId}
        onDragOver={onDragOver}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`block ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
      >
        {/* The real input is visually hidden but focusable: Tab to it, Enter/Space opens the picker. */}
        <input
          id={inputId}
          type="file"
          accept={ACCEPT}
          className="peer sr-only"
          disabled={disabled}
          onChange={onChange}
          aria-describedby={problem ? errorId : undefined}
        />
        <div
          className={`flex items-center justify-center rounded-2xl border-2 border-dashed text-center transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-text ${
            compact ? 'gap-4 px-5 py-4 text-left' : 'flex-col gap-4 px-6 py-14'
          } ${dragging ? 'border-accent-text bg-surface-2' : 'border-line bg-bg hover:border-accent-text/70'}`}
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-accent-text/70 text-accent-text">
            <UploadIcon className="size-5" />
          </span>
          <span>
            <span className="block text-lg font-semibold">
              {compact ? 'Upload another invoice' : 'Drop a PDF or image here'}
            </span>
            <span className="mt-0.5 block text-sm text-muted">
              {compact ? 'or browse files' : 'or browse files'} · PDF, PNG, JPEG · up to {MAX_UPLOAD_MB} MB
            </span>
          </span>
        </div>
      </label>
      {problem && (
        <p id={errorId} role="alert" className="mt-2 flex items-start gap-2 text-sm font-medium text-bad">
          <AlertIcon className="mt-0.5" />
          {problem}
        </p>
      )}
    </section>
  )
}
