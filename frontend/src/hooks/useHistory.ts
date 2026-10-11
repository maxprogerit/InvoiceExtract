import { useCallback, useEffect, useState } from 'react'
import { ApiError, listInvoices } from '../api/client'
import type { Invoice, InvoiceStatus } from '../api/types'

const PAGE_SIZE = 20

export type StatusFilter = InvoiceStatus | 'all'

export function useHistory() {
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [reloadToken, setReloadToken] = useState(0)
  const [items, setItems] = useState<Invoice[]>([])
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  // The first page is "loading" until a response arrives for the CURRENT filter/refresh key.
  // Deriving this (instead of setting a flag inside the effect) avoids a cascading render.
  const requestKey = `${filter}:${reloadToken}`
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const loading = loadedKey !== requestKey || loadingMore

  useEffect(() => {
    const abort = new AbortController()
    listInvoices({ status: filter === 'all' ? undefined : filter, limit: PAGE_SIZE, offset: 0 }, abort.signal)
      .then((page) => {
        setItems(page.items)
        setTotal(page.total)
        setError(null)
        setLoadedKey(requestKey)
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return
        setError(e instanceof ApiError ? e.message : 'Could not load the history.')
        setLoadedKey(requestKey)
      })
    return () => abort.abort()
  }, [filter, requestKey])

  const loadMore = useCallback(async () => {
    setLoadingMore(true)
    try {
      const page = await listInvoices({
        status: filter === 'all' ? undefined : filter,
        limit: PAGE_SIZE,
        offset: items.length,
      })
      setItems((current) => [...current, ...page.items.filter((n) => !current.some((c) => c.id === n.id))])
      setTotal(page.total)
      setError(null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load more.')
    } finally {
      setLoadingMore(false)
    }
  }, [filter, items.length])

  const refresh = useCallback(() => setReloadToken((n) => n + 1), [])

  return { filter, setFilter, items, total, loading, error, loadMore, refresh, hasMore: items.length < total }
}
