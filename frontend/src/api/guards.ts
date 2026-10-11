// Runtime checks for data crossing the network boundary. JSON.parse yields `unknown`; these narrow
// it to our types without `any`. They verify the fields the UI relies on, not every nested value.
import {
  INVOICE_STATUSES,
  STEP_ORDER,
  type ApiErrorBody,
  type Invoice,
  type InvoiceList,
  type InvoiceStatus,
  type StepDetail,
  type StepName,
  type StreamEvent,
} from './types'

type Rec = Record<string, unknown>

export function isRecord(value: unknown): value is Rec {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isInvoiceStatus(value: unknown): value is InvoiceStatus {
  return typeof value === 'string' && (INVOICE_STATUSES as readonly string[]).includes(value)
}

export function isInvoice(value: unknown): value is Invoice {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.filename === 'string' &&
    isInvoiceStatus(value.status) &&
    Array.isArray(value.validation_issues) &&
    (value.extracted_data === null || isRecord(value.extracted_data)) &&
    typeof value.created_at === 'string'
  )
}

export function isInvoiceList(value: unknown): value is InvoiceList {
  return (
    isRecord(value) &&
    Array.isArray(value.items) &&
    value.items.every(isInvoice) &&
    typeof value.total === 'number'
  )
}

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    isRecord(value) &&
    typeof value.code === 'string' &&
    typeof value.message === 'string' &&
    typeof value.request_id === 'string'
  )
}

function isStepName(value: unknown): value is StepName {
  return typeof value === 'string' && (STEP_ORDER as readonly string[]).includes(value)
}

function toStepDetail(value: unknown): StepDetail | null {
  if (!isRecord(value)) return null
  const detail: StepDetail = {}
  if (value.extraction_method === 'text_layer' || value.extraction_method === 'ocr') {
    detail.extraction_method = value.extraction_method
  }
  if (typeof value.pages === 'number') detail.pages = value.pages
  return detail
}

/** Parse one NDJSON line from POST /invoices/stream. Returns null for lines we do not understand. */
export function parseStreamEvent(line: string): StreamEvent | null {
  let raw: unknown
  try {
    raw = JSON.parse(line)
  } catch {
    return null
  }
  if (!isRecord(raw)) return null

  if (raw.event === 'step' && isStepName(raw.step)) {
    return { event: 'step', step: raw.step, detail: toStepDetail(raw.detail) }
  }
  if (raw.event === 'result' && isInvoice(raw.invoice)) {
    return { event: 'result', duplicate: raw.duplicate === true, invoice: raw.invoice }
  }
  if (raw.event === 'error' && isApiErrorBody(raw.error)) {
    return {
      event: 'error',
      status: typeof raw.status === 'number' ? raw.status : 500,
      error: raw.error,
    }
  }
  return null
}
