import { useCallback, useEffect, useState } from 'react'
import { ApiError, getInvoice, type UploadResult } from './api/client'
import type { Invoice } from './api/types'
import { ErrorPanel } from './components/ErrorPanel'
import { HistoryPanel } from './components/HistoryPanel'
import { ProgressSteps } from './components/ProgressSteps'
import { ResultView } from './components/ResultView'
import { ThemeToggle } from './components/ThemeToggle'
import { UploadZone } from './components/UploadZone'
import { useHistory } from './hooks/useHistory'
import { useTheme } from './hooks/useTheme'
import { useUploadFlow } from './hooks/useUploadFlow'

const HASH_PREFIX = '#/invoice/'

function idFromHash(): string | null {
  const hash = window.location.hash
  return hash.startsWith(HASH_PREFIX) ? decodeURIComponent(hash.slice(HASH_PREFIX.length)) : null
}

export default function App() {
  const { theme, toggle } = useTheme()
  const history = useHistory()
  const { refresh } = history

  const [selected, setSelected] = useState<Invoice | null>(null)
  const [alreadyProcessed, setAlreadyProcessed] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const show = useCallback((invoice: Invoice, duplicate: boolean) => {
    setSelected(invoice)
    setAlreadyProcessed(duplicate)
    setLoadError(null)
    window.history.replaceState(null, '', `${HASH_PREFIX}${invoice.id}`)
  }, [])

  const onUploaded = useCallback(
    ({ invoice, duplicate }: UploadResult) => {
      show(invoice, duplicate)
      refresh() // a duplicate changes nothing, but a new invoice must appear in the list
    },
    [show, refresh],
  )
  const upload = useUploadFlow(onUploaded)

  // Deep link: opening /#/invoice/<id> (or pressing back/forward) loads that invoice.
  useEffect(() => {
    const abort = new AbortController()
    const load = () => {
      const id = idFromHash()
      if (!id) {
        setSelected(null)
        return
      }
      getInvoice(id, abort.signal)
        .then((invoice) => {
          setSelected(invoice)
          setAlreadyProcessed(false)
          setLoadError(null)
        })
        .catch((e: unknown) => {
          if (e instanceof DOMException && e.name === 'AbortError') return
          setLoadError(e instanceof ApiError && e.status === 404 ? 'That invoice does not exist.' : 'Could not load that invoice.')
        })
    }
    load()
    window.addEventListener('hashchange', load)
    return () => {
      abort.abort()
      window.removeEventListener('hashchange', load)
    }
  }, [])

  const running = upload.state.phase === 'running'
  const hasResult = selected !== null

  return (
    <div className="min-h-screen">
      <a
        href="#main"
        className="sr-only rounded-lg bg-white px-3 py-2 text-sm font-medium focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 dark:bg-slate-900"
      >
        Skip to main content
      </a>

      <header className="border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
        <div className="mx-auto flex max-w-[96rem] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <img src="/favicon.svg" alt="" className="size-8" />
            <div>
              <h1 className="text-lg font-semibold leading-tight">InvoiceExtract</h1>
              <p className="text-xs text-slate-600 dark:text-slate-400">Upload an invoice → structured, validated data</p>
            </div>
          </div>
          <ThemeToggle theme={theme} onToggle={toggle} />
        </div>
      </header>

      <div className="mx-auto grid max-w-[96rem] grid-cols-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <aside aria-label="Invoice history" className="min-w-0">
          <HistoryPanel
            items={history.items}
            total={history.total}
            loading={history.loading}
            error={history.error}
            filter={history.filter}
            onFilter={history.setFilter}
            onSelect={(invoice) => show(invoice, false)}
            onLoadMore={() => void history.loadMore()}
            hasMore={history.hasMore}
            selectedId={selected?.id ?? null}
          />
        </aside>

        <main id="main" className="min-w-0 space-y-4">
          <UploadZone onFile={upload.start} disabled={running} compact={hasResult || running} />

          {upload.state.phase === 'running' && (
            <ProgressSteps
              fileName={upload.state.file.name}
              uploadPercent={upload.state.uploadPercent}
              step={upload.state.step}
              extractionMethod={upload.state.extractionMethod}
              onCancel={upload.cancel}
            />
          )}

          {upload.state.phase === 'error' && (
            <ErrorPanel
              error={upload.state.error}
              onRetry={() => upload.state.phase === 'error' && upload.start(upload.state.file)}
              onDismiss={upload.reset}
            />
          )}

          {loadError && (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              {loadError}
            </p>
          )}

          {selected && !running && <ResultView key={selected.id} invoice={selected} alreadyProcessed={alreadyProcessed} />}

          {!selected && !running && upload.state.phase === 'idle' && !loadError && (
            <p className="text-center text-sm text-slate-600 dark:text-slate-400">
              Your result will appear here: the document on one side, the extracted fields and validation on the other.
            </p>
          )}
        </main>
      </div>
    </div>
  )
}
