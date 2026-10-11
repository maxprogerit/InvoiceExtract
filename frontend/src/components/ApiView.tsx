const ENDPOINTS: [string, string, string][] = [
  ['POST', '/invoices', 'Upload a PDF/PNG/JPEG (multipart field "file"). 201 new, 200 duplicate'],
  ['POST', '/invoices/stream', 'Same, streaming pipeline progress as NDJSON (what this UI uses)'],
  ['GET', '/invoices', 'List, newest first. ?status=valid|needs_review|failed&limit=&offset='],
  ['GET', '/invoices/{id}', 'One invoice with extracted data and validation issues'],
  ['GET', '/invoices/{id}/export.csv', 'Line items as CSV'],
  ['GET', '/invoices/{id}/file', 'The original upload'],
  ['GET', '/health', 'Liveness + database check (no key needed)'],
]

const CURL = `curl -H "X-API-Key: $API_KEY" \\
     -F "file=@invoice.pdf" \\
     http://localhost:8000/invoices`

export function ApiView({ docsUrl }: { docsUrl: string }) {
  return (
    <div className="animate-in space-y-4">
      <section aria-labelledby="api-access" className="card p-5 sm:p-6">
        <h2 id="api-access" className="text-lg font-semibold">
          Calling the API yourself
        </h2>
        <p className="mt-2 max-w-prose text-sm text-muted">
          This page never shows or stores an API key: the web container adds it on the server side, so the
          key is not part of the JavaScript that reaches your browser. Scripts and other services call the
          API directly and send the key in the <code className="font-mono text-fg">X-API-Key</code> header.
        </p>
        <pre tabIndex={0} aria-label="curl example" className="mt-4 overflow-x-auto rounded-xl bg-bg p-4 font-mono text-[0.8rem] leading-relaxed">
          <code>{CURL}</code>
        </pre>
        <a href={docsUrl} target="_blank" rel="noreferrer" className="btn-accent mt-4">
          Open interactive docs (Swagger)
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
        <p className="mt-2 font-mono text-[0.68rem] text-muted">
          The docs are served by the API itself and can be switched off with ENABLE_DOCS=false.
        </p>
      </section>

      <section aria-labelledby="api-endpoints" className="card p-5 sm:p-6">
        <h2 id="api-endpoints" className="text-lg font-semibold">
          Endpoints
        </h2>
        <div className="mt-3 overflow-x-auto" tabIndex={0} role="region" aria-labelledby="api-endpoints">
          <table className="w-full min-w-[32rem] text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th scope="col" className="caption py-2 pr-4 font-medium">Method</th>
                <th scope="col" className="caption py-2 pr-4 font-medium">Path</th>
                <th scope="col" className="caption py-2 font-medium">Description</th>
              </tr>
            </thead>
            <tbody>
              {ENDPOINTS.map(([method, path, description]) => (
                <tr key={`${method} ${path}`} className="border-b border-line align-top">
                  <td className="py-2.5 pr-4 font-mono text-xs font-semibold text-accent-text">{method}</td>
                  <td className="py-2.5 pr-4 font-mono text-xs">{path}</td>
                  <td className="py-2.5 text-muted">{description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
