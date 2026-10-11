import type { Invoice } from '../api/types'
import { fileUrl } from '../api/client'
import { FileIcon } from './Icons'

export function DocumentPreview({ invoice }: { invoice: Invoice }) {
  const src = fileUrl(invoice.id)
  const isPdf = invoice.content_type === 'application/pdf'
  const isImage = invoice.content_type?.startsWith('image/') === true

  return (
    <section
      aria-labelledby="preview-title"
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3 dark:border-slate-800">
        <h3 id="preview-title" className="text-base font-semibold">
          Original document
        </h3>
        {invoice.file_available && (
          <a
            href={src}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-indigo-700 underline-offset-2 hover:underline dark:text-indigo-300"
          >
            Open in new tab<span className="sr-only"> (opens the original file)</span>
          </a>
        )}
      </div>

      {!invoice.file_available ? (
        <div className="flex h-72 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-slate-600 dark:text-slate-400">
          <FileIcon className="size-8" />
          The original file was not stored for this invoice, so there is no preview.
        </div>
      ) : isPdf ? (
        // Viewer open parameters: fit to width, hide the browser's own toolbar/side panel.
        <iframe title={`Preview of ${invoice.filename}`} src={`${src}#toolbar=0&navpanes=0&view=FitH`} className="h-[70vh] min-h-96 w-full bg-slate-200 dark:bg-slate-800" />
      ) : isImage ? (
        <div className="max-h-[70vh] overflow-auto bg-slate-200 p-2 dark:bg-slate-800">
          <img src={src} alt={`Scan of ${invoice.filename}`} className="mx-auto h-auto max-w-full" />
        </div>
      ) : (
        <p className="p-6 text-sm text-slate-600 dark:text-slate-400">This file type cannot be previewed.</p>
      )}
    </section>
  )
}
