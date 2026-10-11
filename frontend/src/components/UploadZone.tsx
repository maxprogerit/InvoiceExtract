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
          className={`flex items-center justify-center rounded-2xl border-2 border-dashed text-center transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-indigo-600 dark:peer-focus-visible:outline-indigo-400 ${
            compact ? 'gap-3 px-4 py-4' : 'flex-col gap-3 px-6 py-14'
          } ${
            dragging
              ? 'border-indigo-500 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-950/40'
              : 'border-slate-300 bg-white hover:border-indigo-400 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-indigo-500'
          }`}
        >
          <span className="flex size-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
            <UploadIcon className="size-5" />
          </span>
          <span className={compact ? 'text-left' : ''}>
            <span className="block text-base font-semibold">
              {compact ? 'Upload another invoice' : 'Drop an invoice here, or click to browse'}
            </span>
            <span className="mt-1 block text-sm text-slate-600 dark:text-slate-400">
              PDF, PNG or JPEG · up to {MAX_UPLOAD_MB} MB · scans are read with OCR
            </span>
          </span>
        </div>
      </label>
      {problem && (
        <p
          id={errorId}
          role="alert"
          className="mt-2 flex items-start gap-2 text-sm font-medium text-red-700 dark:text-red-400"
        >
          <AlertIcon className="mt-0.5" />
          {problem}
        </p>
      )}
    </section>
  )
}
