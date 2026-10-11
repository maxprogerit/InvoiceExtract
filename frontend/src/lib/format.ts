/**
 * Insert thousands separators into a decimal STRING without converting it to a number
 * (no float rounding, exact for any length). Non-numeric input is returned unchanged.
 */
export function groupThousands(value: string): string {
  const match = /^(-?)(\d+)(\.\d+)?$/.exec(value.trim())
  if (!match) return value
  const [, sign = '', int = '', frac = ''] = match
  return `${sign}${int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${frac}`
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return '—'
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function formatRelative(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return iso
  const seconds = Math.max(0, Math.round((now - then) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  return `${days} d ago`
}

export function methodLabel(method: string): string {
  return method === 'ocr' ? 'OCR' : method === 'text_layer' ? 'Text layer' : method
}
