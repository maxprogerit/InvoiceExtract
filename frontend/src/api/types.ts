// Hand-written mirror of the backend schemas (app/schemas/*.py). Money and quantities are decimal
// STRINGS on the wire ("419.96"): the backend never sends floats, and neither do we compute with them.

export type InvoiceStatus = 'valid' | 'needs_review' | 'failed'
export type Severity = 'error' | 'warning'
export type ExtractionMethod = 'text_layer' | 'ocr'

export const INVOICE_STATUSES: readonly InvoiceStatus[] = ['valid', 'needs_review', 'failed']

export interface ValidationIssue {
  code: string
  severity: Severity
  /** "total", "invoice_date", or "line_items[1].line_total" */
  field: string
  message: string
}

export interface LineItem {
  description: string | null
  quantity: string | null
  unit_price: string | null
  line_total: string | null
}

export interface ExtractedInvoice {
  vendor_name: string | null
  invoice_number: string | null
  invoice_date: string | null
  due_date: string | null
  currency: string | null
  line_items: LineItem[]
  subtotal: string | null
  tax: string | null
  total: string | null
}

export interface Invoice {
  id: string
  filename: string
  file_hash: string
  extraction_method: ExtractionMethod
  status: InvoiceStatus
  extracted_data: ExtractedInvoice | null
  validation_issues: ValidationIssue[]
  model_name: string | null
  prompt_tokens: number | null
  completion_tokens: number | null
  /** Whole pipeline: OCR + LLM + validation + save. */
  processing_ms: number | null
  /** The OpenAI call only. */
  llm_latency_ms: number | null
  file_available: boolean
  content_type: string | null
  created_at: string
  /** True when this upload matched an already-processed file (no new LLM call). */
  duplicate: boolean
}

export interface InvoiceList {
  items: Invoice[]
  total: number
  limit: number
  offset: number
}

export interface ApiErrorBody {
  code: string
  message: string
  request_id: string
}

export type StepName =
  | 'validating_file'
  | 'extracting_text'
  | 'calling_llm'
  | 'validating_data'
  | 'saving'

/** Order in which the backend reports steps; used to decide which ones are already done. */
export const STEP_ORDER: readonly StepName[] = [
  'validating_file',
  'extracting_text',
  'calling_llm',
  'validating_data',
  'saving',
]

export interface StepDetail {
  extraction_method?: ExtractionMethod
  pages?: number
}

export type StreamEvent =
  | { event: 'step'; step: StepName; detail: StepDetail | null }
  | { event: 'result'; duplicate: boolean; invoice: Invoice }
  | { event: 'error'; status: number; error: ApiErrorBody }
