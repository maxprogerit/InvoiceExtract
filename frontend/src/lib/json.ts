import type { Invoice } from '../api/types'

/** The part of an invoice a developer wants to copy: status, extracted data and validation issues. */
export function invoiceJson(invoice: Invoice): string {
  return JSON.stringify(
    {
      status: invoice.status,
      extracted_data: invoice.extracted_data,
      validation_issues: invoice.validation_issues,
    },
    null,
    2,
  )
}

export type JsonTokenKind = 'key' | 'string' | 'number' | 'literal' | 'plain'

export interface JsonToken {
  text: string
  kind: JsonTokenKind
}

// A JSON string optionally followed by ":" (=> it is an object key), or a number, or true/false/null.
const TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b/g

/** Split pretty-printed JSON into coloured pieces without injecting any HTML. */
export function tokenizeJson(text: string): JsonToken[] {
  const tokens: JsonToken[] = []
  let last = 0
  for (const match of text.matchAll(TOKEN)) {
    const index = match.index ?? 0
    if (index > last) tokens.push({ text: text.slice(last, index), kind: 'plain' })
    const [whole, str, colon, num] = match
    if (str !== undefined) {
      tokens.push({ text: str, kind: colon ? 'key' : 'string' })
      if (colon) tokens.push({ text: colon, kind: 'plain' })
    } else if (num !== undefined) {
      tokens.push({ text: whole, kind: 'number' })
    } else {
      tokens.push({ text: whole, kind: 'literal' })
    }
    last = index + whole.length
  }
  if (last < text.length) tokens.push({ text: text.slice(last), kind: 'plain' })
  return tokens
}
