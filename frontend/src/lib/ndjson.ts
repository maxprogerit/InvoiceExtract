/**
 * Incremental line splitter for NDJSON streams. Network chunks do not respect line boundaries,
 * so a JSON line can arrive in pieces; we buffer until a newline shows up.
 */
export function createLineSplitter(onLine: (line: string) => void) {
  let buffer = ''
  const emit = (line: string) => {
    const trimmed = line.trim()
    if (trimmed) onLine(trimmed)
  }
  return {
    push(chunk: string) {
      buffer += chunk
      let newline = buffer.indexOf('\n')
      while (newline >= 0) {
        emit(buffer.slice(0, newline))
        buffer = buffer.slice(newline + 1)
        newline = buffer.indexOf('\n')
      }
    },
    /** Call when the stream ends: emits a final line that had no trailing newline. */
    flush() {
      emit(buffer)
      buffer = ''
    },
  }
}
