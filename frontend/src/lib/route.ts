export type Route =
  | { view: 'extract'; invoiceId: string | null }
  | { view: 'history' }
  | { view: 'api' }

const INVOICE_PREFIX = '#/invoice/'

/** Hash routes: "#/" extract, "#/invoice/<id>" extract + open that invoice, "#/history", "#/api". */
export function parseHash(hash: string): Route {
  if (hash.startsWith(INVOICE_PREFIX)) {
    const id = decodeURIComponent(hash.slice(INVOICE_PREFIX.length))
    return { view: 'extract', invoiceId: id || null }
  }
  if (hash === '#/history') return { view: 'history' }
  if (hash === '#/api') return { view: 'api' }
  return { view: 'extract', invoiceId: null }
}

export const invoiceHash = (id: string): string => `${INVOICE_PREFIX}${encodeURIComponent(id)}`
