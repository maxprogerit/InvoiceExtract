import { describe, expect, it } from 'vitest'
import { parseStreamEvent } from '../api/guards'
import type { ValidationIssue } from '../api/types'
import { detectType } from './files'
import { formatDuration, formatRelative, groupThousands } from './format'
import { issuesForField, issuesForLine, unattachedIssues } from './issues'
import { createLineSplitter } from './ndjson'

const bytes = (...b: number[]) => new Uint8Array(b)

describe('detectType', () => {
  it('recognises PDF, PNG and JPEG by magic bytes', () => {
    expect(detectType(bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31))).toBe('pdf')
    expect(detectType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('png')
    expect(detectType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('jpg')
  })
  it('rejects everything else, including a PNG-looking prefix that is truncated', () => {
    expect(detectType(bytes(0x4d, 0x5a, 0x90))).toBeNull() // MZ executable
    expect(detectType(bytes(0x89, 0x50, 0x4e, 0x47))).toBeNull()
    expect(detectType(bytes())).toBeNull()
  })
})

describe('createLineSplitter', () => {
  it('reassembles a JSON line that arrives in pieces', () => {
    const lines: string[] = []
    const splitter = createLineSplitter((l) => lines.push(l))
    splitter.push('{"event":"st')
    expect(lines).toEqual([])
    splitter.push('ep"}\n{"event":"result"}\n{"par')
    expect(lines).toEqual(['{"event":"step"}', '{"event":"result"}'])
    splitter.push('tial":true}')
    splitter.flush()
    expect(lines.at(-1)).toBe('{"partial":true}')
  })
  it('ignores blank lines', () => {
    const lines: string[] = []
    const splitter = createLineSplitter((l) => lines.push(l))
    splitter.push('\n\n a \n\r\n')
    expect(lines).toEqual(['a'])
  })
})

describe('parseStreamEvent', () => {
  it('parses step events with detail', () => {
    expect(
      parseStreamEvent('{"event":"step","step":"calling_llm","detail":{"extraction_method":"ocr","pages":2}}'),
    ).toEqual({ event: 'step', step: 'calling_llm', detail: { extraction_method: 'ocr', pages: 2 } })
  })
  it('parses error events and defaults a missing status', () => {
    const line = '{"event":"error","status":502,"error":{"code":"llm_upstream_error","message":"m","request_id":"r"}}'
    expect(parseStreamEvent(line)).toMatchObject({ event: 'error', status: 502 })
  })
  it('returns null for unknown steps, garbage and malformed results', () => {
    expect(parseStreamEvent('{"event":"step","step":"time_travel"}')).toBeNull()
    expect(parseStreamEvent('not json')).toBeNull()
    expect(parseStreamEvent('{"event":"result","invoice":{"id":1}}')).toBeNull()
  })
})

describe('format', () => {
  it('groups thousands on decimal strings without touching precision', () => {
    expect(groupThousands('1234567.50')).toBe('1,234,567.50')
    expect(groupThousands('-1234.5')).toBe('-1,234.5')
    expect(groupThousands('419.96')).toBe('419.96')
    expect(groupThousands('12345678901234567890.123456789')).toBe('12,345,678,901,234,567,890.123456789')
    expect(groupThousands('n/a')).toBe('n/a')
  })
  it('formats durations and relative times', () => {
    expect(formatDuration(null)).toBe('—')
    expect(formatDuration(850)).toBe('850 ms')
    expect(formatDuration(2400)).toBe('2.4 s')
    const now = Date.parse('2026-10-10T12:00:00Z')
    expect(formatRelative('2026-10-10T11:59:40Z', now)).toBe('just now')
    expect(formatRelative('2026-10-10T11:30:00Z', now)).toBe('30 min ago')
    expect(formatRelative('2026-10-09T12:00:00Z', now)).toBe('1 d ago')
  })
})

describe('issue helpers', () => {
  const issue = (field: string): ValidationIssue => ({ code: 'c', severity: 'error', field, message: 'm' })
  const issues = [issue('total'), issue('line_items[1].line_total'), issue('line_items[10].line_total'), issue('tax')]

  it('matches field and line issues exactly (line 1 must not match line 10)', () => {
    expect(issuesForField(issues, 'total')).toHaveLength(1)
    expect(issuesForLine(issues, 1).map((i) => i.field)).toEqual(['line_items[1].line_total'])
  })
  it('lists issues that have no visible home', () => {
    expect(unattachedIssues(issues, ['total']).map((i) => i.field)).toEqual(['tax'])
  })
})
