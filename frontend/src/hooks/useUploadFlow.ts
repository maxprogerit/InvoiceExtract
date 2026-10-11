import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, uploadInvoice, type UploadResult } from '../api/client'
import type { ExtractionMethod, StepName } from '../api/types'

export type UploadState =
  | { phase: 'idle' }
  | {
      phase: 'running'
      file: File
      uploadPercent: number
      step: StepName | null
      extractionMethod: ExtractionMethod | null
    }
  | { phase: 'error'; file: File; error: ApiError }

export function useUploadFlow(onDone: (result: UploadResult) => void) {
  const [state, setState] = useState<UploadState>({ phase: 'idle' })
  const controller = useRef<AbortController | null>(null)
  const onDoneRef = useRef(onDone)
  useEffect(() => {
    onDoneRef.current = onDone
  }, [onDone])

  // Abort an in-flight upload if the component goes away.
  useEffect(() => () => controller.current?.abort(), [])

  const start = useCallback((file: File) => {
    controller.current?.abort()
    const abort = new AbortController()
    controller.current = abort
    setState({ phase: 'running', file, uploadPercent: 0, step: null, extractionMethod: null })

    uploadInvoice(file, {
      signal: abort.signal,
      onUploadProgress: (uploadPercent) =>
        setState((s) => (s.phase === 'running' ? { ...s, uploadPercent } : s)),
      onStep: (step, detail) =>
        setState((s) =>
          s.phase === 'running'
            ? { ...s, step, extractionMethod: detail?.extraction_method ?? s.extractionMethod }
            : s,
        ),
    })
      .then((result) => {
        setState({ phase: 'idle' })
        onDoneRef.current(result)
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          setState({ phase: 'idle' })
          return
        }
        const apiError =
          error instanceof ApiError ? error : new ApiError(0, 'unexpected', 'An unexpected error occurred.')
        setState({ phase: 'error', file, error: apiError })
      })
  }, [])

  const cancel = useCallback(() => controller.current?.abort(), [])
  const reset = useCallback(() => setState({ phase: 'idle' }), [])

  return { state, start, cancel, reset }
}
