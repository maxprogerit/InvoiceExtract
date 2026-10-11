import { ApiError, NETWORK_ERROR_CODE } from '../api/client'
import { AlertIcon, RefreshIcon } from './Icons'

interface Copy {
  title: string
  hint: string
  retryable: boolean
}

// Friendly wording per backend error code. The server's own message is always shown too.
function copyFor(error: ApiError): Copy {
  switch (error.code) {
    case 'unreadable_document':
      return {
        title: "We couldn't read this document",
        hint: 'Try a clearer scan, a higher-resolution photo, or a PDF that contains selectable text.',
        retryable: false,
      }
    case 'unsupported_file_type':
      return { title: 'Unsupported file type', hint: 'Upload a PDF, PNG or JPEG file.', retryable: false }
    case 'file_too_large':
      return { title: 'File is too large', hint: 'Upload a smaller file or compress the scan.', retryable: false }
    case 'too_many_pages':
      return { title: 'Too many pages', hint: 'Split the document and upload the invoice pages only.', retryable: false }
    case 'llm_upstream_error':
      return {
        title: 'The AI service is not responding',
        hint: 'The text was extracted, but the AI step failed or timed out. Nothing was saved; trying again is safe.',
        retryable: true,
      }
    case 'llm_not_configured':
      return {
        title: 'AI extraction is not configured',
        hint: 'The server has no OpenAI API key. Ask the administrator to set OPENAI_API_KEY.',
        retryable: false,
      }
    case 'ocr_unavailable':
      return { title: 'OCR is unavailable on the server', hint: 'Text-based PDFs may still work.', retryable: true }
    case 'unauthorized':
      return {
        title: 'The server rejected our credentials',
        hint: 'The proxy in front of the API has a missing or wrong API key.',
        retryable: false,
      }
    case NETWORK_ERROR_CODE:
      return { title: 'Cannot reach the server', hint: 'Check your connection and try again.', retryable: true }
    default:
      return { title: 'Something went wrong', hint: 'Please try again.', retryable: error.status >= 500 }
  }
}

interface Props {
  error: ApiError
  onRetry?: () => void
  onDismiss: () => void
}

export function ErrorPanel({ error, onRetry, onDismiss }: Props) {
  const { title, hint, retryable } = copyFor(error)
  return (
    <section
      role="alert"
      className="animate-in rounded-2xl border border-red-200 bg-red-50 p-5 dark:border-red-900 dark:bg-red-950/40"
    >
      <div className="flex items-start gap-3">
        <AlertIcon className="mt-0.5 size-5 text-red-700 dark:text-red-400" />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-red-900 dark:text-red-200">{title}</h2>
          <p className="mt-1 text-sm text-red-900/90 dark:text-red-200/90">{error.message}</p>
          <p className="mt-1 text-sm text-red-900/80 dark:text-red-200/80">{hint}</p>
          {error.requestId && (
            <p className="mt-2 text-xs text-red-900/70 dark:text-red-200/70">
              Request ID: <span className="font-mono">{error.requestId}</span>
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {retryable && onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-2 rounded-lg bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800 dark:bg-red-600 dark:hover:bg-red-500"
              >
                <RefreshIcon /> Try again
              </button>
            )}
            <button
              type="button"
              onClick={onDismiss}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-900 ring-1 ring-red-300 hover:bg-red-100 dark:text-red-200 dark:ring-red-800 dark:hover:bg-red-950"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
