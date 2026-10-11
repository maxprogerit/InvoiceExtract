export const MAX_UPLOAD_MB = Number(import.meta.env.VITE_MAX_UPLOAD_MB ?? 10)
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024

export const ACCEPT = 'application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg'

export type DetectedType = 'pdf' | 'png' | 'jpg'

/** Identify a file by its leading bytes, like the backend does (the extension proves nothing). */
export function detectType(head: Uint8Array): DetectedType | null {
  const startsWith = (...bytes: number[]) => bytes.every((b, i) => head[i] === b)
  if (startsWith(0x25, 0x50, 0x44, 0x46, 0x2d)) return 'pdf' // %PDF-
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'png'
  if (startsWith(0xff, 0xd8, 0xff)) return 'jpg'
  return null
}

/** Client-side pre-check for a fast, friendly error. The server remains the authority. */
export async function checkFile(file: File): Promise<string | null> {
  if (file.size === 0) return 'This file is empty.'
  if (file.size > MAX_UPLOAD_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1)
    return `This file is ${mb} MB; the limit is ${MAX_UPLOAD_MB} MB.`
  }
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer())
  if (detectType(head) === null) {
    return 'Only PDF, PNG and JPEG files are supported (the file content does not look like one).'
  }
  return null
}
