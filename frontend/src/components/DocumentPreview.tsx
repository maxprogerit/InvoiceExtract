import type { Invoice } from '../api/types'
import { fileUrl } from '../api/client'
import { FileIcon } from './Icons'

export function DocumentPreview({ invoice }: { invoice: Invoice }) {
  const src = fileUrl(invoice.id)
  const isPdf = invoice.content_type === 'application/pdf'
  const isImage = invoice.content_type?.startsWith('image/') === true

  return (
    <section aria-labelledby="preview-title" className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
        <h3 id="preview-title" className="caption">
          Original document
        </h3>
        {invoice.file_available && (
          <a href={src} target="_blank" rel="noreferrer" className="font-mono text-xs font-medium text-accent-text underline-offset-2 hover:underline">
            Open in new tab<span className="sr-only"> (opens the original file)</span>
          </a>
        )}
      </div>

      {!invoice.file_available ? (
        <div className="flex h-60 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted">
          <FileIcon className="size-8" />
          The original file was not stored for this invoice, so there is no preview.
        </div>
      ) : isPdf ? (
        // Viewer open parameters: fit to width, hide the browser's own toolbar/side panel.
        <iframe
          title={`Preview of ${invoice.filename}`}
          src={`${src}#toolbar=0&navpanes=0&view=FitH`}
          className="h-[60vh] min-h-96 w-full bg-surface-2"
        />
      ) : isImage ? (
        <div className="max-h-[60vh] overflow-auto bg-surface-2 p-2">
          <img src={src} alt={`Scan of ${invoice.filename}`} className="mx-auto h-auto max-w-full" />
        </div>
      ) : (
        <p className="p-6 text-sm text-muted">This file type cannot be previewed.</p>
      )}
    </section>
  )
}
