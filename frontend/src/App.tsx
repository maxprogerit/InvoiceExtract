import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ApiError, getInvoice, type UploadResult } from './api/client'
import type { Invoice } from './api/types'
import { ApiView } from './components/ApiView'
import { CopyButton } from './components/CopyButton'
import { DocumentPreview } from './components/DocumentPreview'
import { ErrorPanel } from './components/ErrorPanel'
import { FileCard } from './components/FileCard'
import { HistoryView } from './components/HistoryView'
import { DownloadIcon, PlusIcon } from './components/Icons'
import { Notice } from './components/Notice'
import { ResultPanel } from './components/ResultPanel'
import { Sidebar } from './components/Sidebar'
import { UploadZone } from './components/UploadZone'
import { useHistory } from './hooks/useHistory'
import { useTheme } from './hooks/useTheme'
import { useUploadFlow } from './hooks/useUploadFlow'
import { csvUrl } from './api/client'
import { formatDateTime } from './lib/format'
import { invoiceJson } from './lib/json'
import { invoiceHash, parseHash, type Route } from './lib/route'

// Interactive API docs are served by the API itself, not by the web container.
const DOCS_URL: string =
  import.meta.env.VITE_DOCS_URL ?? `${window.location.protocol}//${window.location.hostname}:8000/docs`

function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

function PageHeader({ title, subtitle, actions }: { title: string; subtitle: string; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1 text-muted">{subtitle}</p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

export default function App() {
  const { theme, toggle } = useTheme()
  const route = useRoute()
  const history = useHistory()
  const { refresh } = history

  // `loaded` is a cache of the last invoice we fetched or received; what is DISPLAYED is derived from
  // the URL below, so navigating away needs no state reset (and no setState inside an effect).
  const [loaded, setLoaded] = useState<Invoice | null>(null)
  const [alreadyProcessed, setAlreadyProcessed] = useState(false)
  const [loadError, setLoadError] = useState<{ id: string; message: string } | null>(null)

  const show = useCallback((invoice: Invoice, duplicate: boolean) => {
    setLoaded(invoice)
    setAlreadyProcessed(duplicate)
    setLoadError(null)
    window.location.hash = invoiceHash(invoice.id)
  }, [])

  const onUploaded = useCallback(
    ({ invoice, duplicate }: UploadResult) => {
      show(invoice, duplicate)
      refresh() // a duplicate changes nothing, but a new invoice must appear in the history
    },
    [show, refresh],
  )
  const upload = useUploadFlow(onUploaded)
  const { reset: resetUpload } = upload

  // The URL is the source of truth for which invoice is open (deep links, back/forward, reload).
  const wantedId = route.view === 'extract' ? route.invoiceId : null
  const selected = wantedId !== null && loaded?.id === wantedId ? loaded : null
  const visibleLoadError = loadError !== null && loadError.id === wantedId ? loadError.message : null
  const needsFetch = wantedId !== null && selected === null && visibleLoadError === null

  useEffect(() => {
    if (!needsFetch || wantedId === null) return
    const abort = new AbortController()
    getInvoice(wantedId, abort.signal)
      .then((invoice) => {
        setLoaded(invoice)
        setAlreadyProcessed(false)
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return
        setLoadError({
          id: wantedId,
          message: e instanceof ApiError && e.status === 404 ? 'That invoice does not exist.' : 'Could not load that invoice.',
        })
      })
    return () => abort.abort()
  }, [needsFetch, wantedId])

  const newInvoice = () => {
    resetUpload()
    window.location.hash = '#/'
  }

  const running = upload.state.phase === 'running'
  const hasResult = selected !== null && !running

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[14.5rem_minmax(0,1fr)]">
      <a
        href="#main"
        className="sr-only rounded-lg bg-surface px-3 py-2 text-sm font-medium focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10"
      >
        Skip to main content
      </a>
      <Sidebar route={route} theme={theme} onToggleTheme={toggle} docsUrl={DOCS_URL} />

      <main id="main" className="min-w-0 px-4 py-6 sm:px-8 sm:py-8">
        {route.view === 'extract' && (
          <>
            <PageHeader
              title="Extract invoice data"
              subtitle="Upload an invoice and get validated, structured JSON."
              actions={
                hasResult && (
                  <>
                    <a href={csvUrl(selected.id)} download className="btn">
                      <DownloadIcon /> Export CSV
                    </a>
                    <CopyButton text={invoiceJson(selected)} label="Copy JSON" />
                    <button type="button" onClick={newInvoice} className="btn-accent">
                      <PlusIcon /> New invoice
                    </button>
                  </>
                )
              }
            />

            <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
              <div className="min-w-0 space-y-4">
                <UploadZone onFile={upload.start} disabled={running} compact={selected !== null || running} />

                {upload.state.phase === 'running' && (
                  <FileCard
                    mode="running"
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

                {visibleLoadError && <Notice tone="bad">{visibleLoadError}</Notice>}

                {hasResult && (
                  <>
                    <FileCard mode="done" invoice={selected} />
                    <DocumentPreview key={selected.id} invoice={selected} />
                  </>
                )}
              </div>

              <div className="min-w-0 space-y-4">
                {hasResult && alreadyProcessed && (
                  <Notice tone="info">
                    <strong>Already processed.</strong> This exact file was uploaded before (
                    {formatDateTime(selected.created_at)}). Showing the stored result; no new AI call was made and
                    nothing was charged.
                  </Notice>
                )}
                {hasResult && selected.status === 'failed' && (
                  <Notice tone="bad">
                    <strong>No amounts could be extracted.</strong> This may not be an invoice, or the scan is too poor to read.
                  </Notice>
                )}
                {hasResult && selected.status === 'needs_review' && (
                  <Notice tone="warn">
                    <strong>Needs a human check.</strong> The data was extracted, but at least one validation rule failed.
                    Problems are highlighted below.
                  </Notice>
                )}

                {hasResult ? (
                  <ResultPanel key={selected.id} invoice={selected} />
                ) : (
                  !running && (
                    <p className="card px-6 py-10 text-center text-sm text-muted">
                      The result appears here: extracted fields, line items, totals and the validation checks.
                    </p>
                  )
                )}
              </div>
            </div>
          </>
        )}

        {route.view === 'history' && (
          <>
            <PageHeader title="History" subtitle="Every invoice processed so far. Pick one to open it." />
            <HistoryView
              items={history.items}
              total={history.total}
              loading={history.loading}
              error={history.error}
              filter={history.filter}
              onFilter={history.setFilter}
              onSelect={(invoice) => show(invoice, false)}
              onLoadMore={() => void history.loadMore()}
              hasMore={history.hasMore}
            />
          </>
        )}

        {route.view === 'api' && (
          <>
            <PageHeader title="API" subtitle="Everything this UI does is available over plain HTTP." />
            <ApiView docsUrl={DOCS_URL} />
          </>
        )}
      </main>
    </div>
  )
}
