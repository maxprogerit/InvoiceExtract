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
    <section role="alert" className="animate-in rounded-2xl border border-bad/50 bg-bad/10 p-5">
      <div className="flex items-start gap-3">
        <AlertIcon className="mt-0.5 size-5 text-bad" />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-bad">{title}</h2>
          <p className="mt-1 text-sm">{error.message}</p>
          <p className="mt-1 text-sm text-muted">{hint}</p>
          {error.requestId && (
            <p className="mt-2 font-mono text-xs text-muted">
              Request ID: <span>{error.requestId}</span>
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {retryable && onRetry && (
              <button type="button" onClick={onRetry} className="btn-accent">
                <RefreshIcon /> Try again
              </button>
            )}
            <button type="button" onClick={onDismiss} className="btn">
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
