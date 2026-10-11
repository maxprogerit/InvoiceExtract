import { isApiErrorBody, isInvoice, isInvoiceList, isRecord, parseStreamEvent } from './guards'
import type { Invoice, InvoiceList, InvoiceStatus, StepDetail, StepName } from './types'
import { createLineSplitter } from '../lib/ndjson'

// Same-origin: nginx (Docker) or the Vite dev proxy forwards /api/* to the backend and adds the
// X-API-Key header on the server side. The browser never sees or sends the key.
const BASE = '/api'

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly requestId: string | null

  constructor(status: number, code: string, message: string, requestId: string | null = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.requestId = requestId
  }
}

export const NETWORK_ERROR_CODE = 'network_error'

function networkError(): ApiError {
  return new ApiError(0, NETWORK_ERROR_CODE, 'Could not reach the server. Check your connection and try again.')
}

/** Turn a non-2xx response body into an ApiError (handles our error shape and FastAPI's 422 shape). */
function errorFromBody(status: number, body: unknown): ApiError {
  if (isRecord(body) && isApiErrorBody(body.error)) {
    const { code, message, request_id } = body.error
    return new ApiError(status, code, message, request_id)
  }
  if (isRecord(body) && body.detail !== undefined) {
    return new ApiError(status, 'invalid_request', 'The request was not accepted by the server.')
  }
  return new ApiError(status, 'http_error', `The server answered with HTTP ${status}.`)
}

async function getJson<T>(path: string, guard: (v: unknown) => v is T, signal?: AbortSignal): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${BASE}${path}`, { signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw networkError()
  }
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) throw errorFromBody(response.status, body)
  if (!guard(body)) throw new ApiError(response.status, 'bad_response', 'The server sent an unexpected response.')
  return body
}

export interface ListParams {
  status?: InvoiceStatus
  limit?: number
  offset?: number
}

export function listInvoices(params: ListParams, signal?: AbortSignal): Promise<InvoiceList> {
  const query = new URLSearchParams()
  if (params.status) query.set('status', params.status)
  query.set('limit', String(params.limit ?? 20))
  query.set('offset', String(params.offset ?? 0))
  return getJson(`/invoices?${query.toString()}`, isInvoiceList, signal)
}

export function getInvoice(id: string, signal?: AbortSignal): Promise<Invoice> {
  return getJson(`/invoices/${encodeURIComponent(id)}`, isInvoice, signal)
}

export const fileUrl = (id: string): string => `${BASE}/invoices/${encodeURIComponent(id)}/file`
export const csvUrl = (id: string): string => `${BASE}/invoices/${encodeURIComponent(id)}/export.csv`

export interface UploadHandlers {
  /** 0..100, from the browser's real upload progress. */
  onUploadProgress: (percent: number) => void
  /** Called when the server reports it has started a pipeline stage. */
  onStep: (step: StepName, detail: StepDetail | null) => void
  signal?: AbortSignal
}

export interface UploadResult {
  invoice: Invoice
  duplicate: boolean
}

/**
 * Upload via XMLHttpRequest because fetch() cannot report upload progress. The response is NDJSON
 * and is parsed incrementally, so each pipeline step is shown when the server actually reaches it.
 */
export function uploadInvoice(file: File, handlers: UploadHandlers): Promise<UploadResult> {
  return new Promise<UploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${BASE}/invoices/stream`)
    xhr.responseType = 'text'

    let settled = false
    let consumed = 0
    const settle = (action: () => void) => {
      if (!settled) {
        settled = true
        action()
      }
    }

    const splitter = createLineSplitter((line) => {
      const event = parseStreamEvent(line)
      if (!event) return
      if (event.event === 'step') handlers.onStep(event.step, event.detail)
      else if (event.event === 'result') settle(() => resolve({ invoice: event.invoice, duplicate: event.duplicate }))
      else {
        settle(() => reject(new ApiError(event.status, event.error.code, event.error.message, event.error.request_id)))
      }
    })

    const drain = () => {
      const text = xhr.responseText
      splitter.push(text.slice(consumed))
      consumed = text.length
    }

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) handlers.onUploadProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.upload.onload = () => handlers.onUploadProgress(100)

    xhr.onprogress = () => {
      // HTTP-level errors (401, 422) arrive as one JSON body, not NDJSON: handled in onload.
      if (xhr.status === 200) drain()
    }

    xhr.onload = () => {
      if (xhr.status === 200) {
        drain()
        splitter.flush()
        settle(() => reject(new ApiError(200, 'bad_response', 'The server closed the stream without a result.')))
        return
      }
      let body: unknown = null
      try {
        body = JSON.parse(xhr.responseText)
      } catch {
        // not JSON: fall through to the generic error
      }
      settle(() => reject(errorFromBody(xhr.status, body)))
    }

    xhr.onerror = () => settle(() => reject(networkError()))
    xhr.ontimeout = () => settle(() => reject(networkError()))
    xhr.onabort = () => settle(() => reject(new DOMException('Upload cancelled', 'AbortError')))

    handlers.signal?.addEventListener('abort', () => xhr.abort(), { once: true })

    const form = new FormData()
    form.append('file', file, file.name)
    xhr.send(form)
  })
}
