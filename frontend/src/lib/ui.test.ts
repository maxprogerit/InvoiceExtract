import { describe, expect, it } from 'vitest'
import type { ExtractedInvoice, ValidationIssue } from '../api/types'
import { buildChecks, notes } from './checks'
import { tokenizeJson } from './json'
import { invoiceHash, parseHash } from './route'

const complete: ExtractedInvoice = {
  vendor_name: 'Acme',
  invoice_number: 'INV-1',
  invoice_date: '2026-03-15',
  due_date: null,
  currency: 'EUR',
  line_items: [{ description: 'Widget', quantity: '2', unit_price: '5.00', line_total: '10.00' }],
  subtotal: '10.00',
  tax: '2.00',
  total: '12.00',
}
const issue = (code: string, severity: 'error' | 'warning' = 'error'): ValidationIssue => ({
  code,
  severity,
  field: 'total',
  message: `${code} message`,
})
const stateOf = (checks: ReturnType<typeof buildChecks>, id: string) => checks.find((c) => c.id === id)?.state

describe('buildChecks', () => {
  it('passes everything for a clean invoice', () => {
    expect(buildChecks(complete, []).map((c) => c.state)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok', 'ok'])
  })

  it('fails exactly the check whose rule failed and carries the backend message', () => {
    const checks = buildChecks(complete, [issue('total_mismatch')])
    expect(stateOf(checks, 'total')).toBe('bad')
    expect(checks.find((c) => c.id === 'total')?.messages).toEqual(['total_mismatch message'])
    expect(stateOf(checks, 'subtotal')).toBe('ok')
  })

  it('reports "unknown" (not "ok") when the data to verify is missing', () => {
    const sparse = { ...complete, subtotal: null, line_items: [], currency: null, invoice_date: null }
    const checks = buildChecks(sparse, [])
    expect(stateOf(checks, 'subtotal')).toBe('unknown')
    expect(stateOf(checks, 'total')).toBe('unknown')
    expect(stateOf(checks, 'currency')).toBe('unknown')
    expect(stateOf(checks, 'dates')).toBe('unknown')
  })

  it('maps both date rules onto the dates check', () => {
    expect(stateOf(buildChecks(complete, [issue('due_before_invoice')]), 'dates')).toBe('bad')
    expect(stateOf(buildChecks(complete, [issue('invalid_date')]), 'dates')).toBe('bad')
  })

  it('ignores warnings when judging checks, and lists them as notes', () => {
    const warning = issue('missing_optional_field', 'warning')
    expect(buildChecks(complete, [warning]).every((c) => c.state === 'ok')).toBe(true)
    expect(notes([warning, issue('total_mismatch')])).toEqual([warning])
  })
})

describe('parseHash', () => {
  it('routes the four views', () => {
    expect(parseHash('')).toEqual({ view: 'extract', invoiceId: null })
    expect(parseHash('#/history')).toEqual({ view: 'history' })
    expect(parseHash('#/api')).toEqual({ view: 'api' })
    expect(parseHash('#/invoice/abc-123')).toEqual({ view: 'extract', invoiceId: 'abc-123' })
  })
  it('round-trips ids and falls back to extract for unknown hashes', () => {
    expect(parseHash(invoiceHash('a b/c'))).toEqual({ view: 'extract', invoiceId: 'a b/c' })
    expect(parseHash('#/nope')).toEqual({ view: 'extract', invoiceId: null })
    expect(parseHash('#/invoice/')).toEqual({ view: 'extract', invoiceId: null })
  })
})

describe('tokenizeJson', () => {
  it('classifies keys, strings, numbers and literals, and loses no characters', () => {
    const text = JSON.stringify({ vendor: 'ACME', total: '12.00', qty: 3, ok: true, none: null }, null, 2)
    const tokens = tokenizeJson(text)
    expect(tokens.map((t) => t.text).join('')).toBe(text)
    const kinds = (kind: string) => tokens.filter((t) => t.kind === kind).map((t) => t.text)
    expect(kinds('key')).toEqual(['"vendor"', '"total"', '"qty"', '"ok"', '"none"'])
    expect(kinds('string')).toEqual(['"ACME"', '"12.00"'])
    expect(kinds('number')).toEqual(['3'])
    expect(kinds('literal')).toEqual(['true', 'null'])
  })
  it('does not mistake digits or colons inside strings for tokens', () => {
    const tokens = tokenizeJson('{"a": "x: 12 true"}')
    expect(tokens.filter((t) => t.kind === 'string').map((t) => t.text)).toEqual(['"x: 12 true"'])
    expect(tokens.some((t) => t.kind === 'number' || t.kind === 'literal')).toBe(false)
  })
})
