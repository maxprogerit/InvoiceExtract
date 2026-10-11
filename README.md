<p align="center"><img src="docs/banner.png" alt="Invoice Extract: upload an invoice, get validated, structured JSON back" width="900"></p>

# InvoiceExtract

Upload an invoice (PDF or image) → text extraction / OCR → LLM structured extraction → deterministic
validation → PostgreSQL → JSON API, plus a small web UI.

> **This is a personal portfolio project.** It is a real, working pipeline (no mocked OCR, no canned
> results in the product code), but it has not been through a production hardening, load or security
> review, and nobody has measured its extraction accuracy on real-world invoices. See
> [Known limitations](#known-limitations).

![Result view](docs/screenshots/05-result-needs-review.png)

## What it does

1. **Upload checks** – file type is detected from magic bytes (not the extension), size limit
   (default 10 MB), PDF page limit (default 5).
2. **Text extraction** – PDF pages with a text layer use PyMuPDF; pages without one (and images) are
   rendered/OCR'd with Tesseract. The method used is stored (`text_layer` | `ocr`).
3. **LLM extraction** – the text goes to OpenAI (Responses API + Structured Outputs with a Pydantic
   schema). Money is `Decimal` end to end (strings on the wire, never floats); missing fields are `null`.
4. **Deterministic validation** – plain Python, not the LLM: line math, subtotal, total, dates,
   currency code. Result: `valid` | `needs_review` | `failed` plus a list of specific issues.
5. **Persistence** – PostgreSQL via Alembic migrations. The same file (SHA-256) is never sent to the
   LLM twice: the stored result is returned instead.
6. **API + UI** – REST API with API-key auth, CSV export, and a React UI with live progress.

## Architecture

```mermaid
flowchart LR
    Browser -->|"/ (static) and /api/*"| Nginx["nginx (web)<br/>adds X-API-Key"]
    Nginx -->|"/api/* → /*"| API["FastAPI (api)"]
    Curl["curl / other clients<br/>send X-API-Key"] --> API
    subgraph pipeline [POST /invoices]
        direction TB
        V[validate upload<br/>magic bytes, size, pages] --> H[sha256 + duplicate check]
        H -->|new| T[text layer or Tesseract OCR]
        T --> L[OpenAI structured output]
        L --> R[validation rules]
        R --> S[(PostgreSQL)]
        H -->|duplicate| S
    end
    API --> pipeline
```

```
app/
  api/            routes (health, invoices)            ← controllers
  services/       file_validation, text_extraction, ocr, llm_extraction,
                  invoice_validation, invoice_service, csv_export   ← business logic
  repositories/   invoice_repository                   ← data access
  schemas/        extraction (LLM schema), validation, invoice (API DTOs)
  models/         SQLAlchemy entities
  core/           config, logging, security, database, errors
alembic/          migrations (the schema is never created by application code)
frontend/         React + Vite + TypeScript + Tailwind, built and served by nginx
```

## Quick start (Docker)

Requirements: Docker with Compose v2, and an OpenAI API key.

```bash
cp .env.example .env
# edit .env: set API_KEY (a long random string) and OPENAI_API_KEY
docker compose up --build
```

This starts PostgreSQL, applies the migrations (one-shot `migrate` service), starts the API, and
starts the web UI.

| URL | What |
|---|---|
| http://localhost:8080 | Web UI (nginx adds the API key for you) |
| http://localhost:8000/docs | Swagger UI of the API (`ENABLE_DOCS=false` turns it off) |
| http://localhost:8000/health | Liveness + database check |

To read scanned documents in other languages, add Tesseract packs at build time and tell the app to
use them: `TESSERACT_LANGS="eng rus"` and `OCR_LANGUAGES=eng+rus` in `.env`.

### Try the UI without an OpenAI key

```bash
docker compose -f docker-compose.yml -f docker-compose.stub.yml up --build
```

Everything is real except the AI step, which is replaced by a regex parser that only understands the
synthetic sample invoices in `tests/samples`. Results are labelled `STUB (no real LLM)`. This exists
for UI development and screenshots; it is not part of the product image.

## API

Every `/invoices*` endpoint needs the header `X-API-Key: <API_KEY>`.

| Method | Path | Description |
|---|---|---|
| POST | `/invoices` | multipart upload (`file`). `201` new, `200` duplicate |
| POST | `/invoices/stream` | same, but streams real pipeline progress as NDJSON (used by the UI) |
| GET | `/invoices?status=&limit=&offset=` | newest first; `limit` 1–100 |
| GET | `/invoices/{id}` | one invoice |
| GET | `/invoices/{id}/export.csv` | line items as CSV |
| GET | `/invoices/{id}/file` | the original upload (for previews) |
| GET | `/health` | no key needed |

Errors always look like `{"error": {"code", "message", "request_id"}}`; `request_id` also appears in
the logs and the `X-Request-ID` response header. Mapping: `415` unsupported type, `413` too large,
`422` unreadable document / too many pages, `502` LLM provider failure, `503` OCR or LLM not
configured, `401` bad key.

### Examples

The responses below were recorded from a running stack **with the stubbed AI step**
(`docker-compose.stub.yml`), which is why `model_name` says `STUB` and the token counts are `null`.
With a real key, `model_name`, `prompt_tokens`, `completion_tokens` and the extracted values come
from OpenAI. Everything else (hash, text-layer extraction, validation, storage, CSV) is the real code.

```bash
curl -H "X-API-Key: $API_KEY" -F "file=@tests/samples/invoice_text.pdf" http://localhost:8000/invoices
```

```json
{
  "id": "8d035589-67ff-4804-a3d5-17632b4141d6",
  "filename": "invoice_text.pdf",
  "file_hash": "fc90673dae6622f8d7c75b3ab0c0ec54e4a81a457cb57e4496a56cf770eff84b",
  "extraction_method": "text_layer",
  "status": "valid",
  "extracted_data": {
    "vendor_name": "Acme Test Supplies Ltd",
    "invoice_number": "INV-2026-0042",
    "invoice_date": "2026-03-15",
    "due_date": "2026-04-14",
    "currency": "EUR",
    "line_items": [
      {"description": "Widget A", "quantity": "10", "unit_price": "12.50", "line_total": "125.00"},
      {"description": "Gadget B", "quantity": "3", "unit_price": "49.99", "line_total": "149.97"},
      {"description": "Service fee", "quantity": "1", "unit_price": "75.00", "line_total": "75.00"}
    ],
    "subtotal": "349.97",
    "tax": "69.99",
    "total": "419.96"
  },
  "validation_issues": [],
  "model_name": "STUB (no real LLM)",
  "prompt_tokens": null,
  "completion_tokens": null,
  "processing_ms": 1505,
  "llm_latency_ms": 0,
  "file_available": true,
  "content_type": "application/pdf",
  "created_at": "2026-10-10T14:08:41.704499Z",
  "duplicate": false
}
```

`tests/samples/invoice_wrong_totals.pdf` has deliberately inconsistent numbers; the validation part
of its response (`status` is `needs_review`):

```json
{
  "status": "needs_review",
  "validation_issues": [
    {"code": "subtotal_mismatch", "severity": "error", "field": "subtotal",
     "message": "Sum of line totals is 349.97 but subtotal is 359.97"},
    {"code": "total_mismatch", "severity": "error", "field": "total",
     "message": "subtotal + tax = 429.96 but total is 439.96"}
  ]
}
```

Uploading the same file again returns `200` with `"duplicate": true` and the stored record, and no
LLM call is made. CSV export (`GET /invoices/{id}/export.csv`):

```csv
invoice_number,vendor_name,currency,line_no,description,quantity,unit_price,line_total
INV-2026-0042,Acme Test Supplies Ltd,EUR,1,Widget A,10,12.50,125.00
INV-2026-0042,Acme Test Supplies Ltd,EUR,2,Gadget B,3,49.99,149.97
INV-2026-0042,Acme Test Supplies Ltd,EUR,3,Service fee,1,75.00,75.00
```

Errors:

```
$ curl http://localhost:8000/invoices                                   # HTTP 401
{"error":{"code":"unauthorized","message":"Invalid or missing API key","request_id":"3bf3a537fa4347159a84962060a02b5f"}}

$ curl -H "X-API-Key: $API_KEY" -F "file=@notes.pdf" .../invoices      # HTTP 415 (text file named .pdf)
{"error":{"code":"unsupported_file_type","message":"Only PDF, PNG and JPEG files are supported","request_id":"9f1e1f14f2c94f3b9f513662afbeb967"}}
```

## Validation rules

All checks use exact `Decimal` arithmetic with an absolute tolerance of 0.01.

| Check | Code | Effect |
|---|---|---|
| `quantity × unit_price` ≈ `line_total` per line | `line_total_mismatch` | error |
| sum of `line_total` ≈ `subtotal` | `subtotal_mismatch` | error |
| `subtotal + tax` ≈ `total` (falls back to the sum of lines if no subtotal; tax missing counts as 0) | `total_mismatch` | error |
| `invoice_date` / `due_date` are real `YYYY-MM-DD` dates, due ≥ invoice | `invalid_date`, `due_before_invoice` | error |
| currency is a known ISO 4217 code | `invalid_currency` | error |
| vendor, number, invoice date, currency, total present | `missing_field` | error |
| due date, tax, subtotal, line items present; lines complete | `missing_optional_field`, `no_line_items`, `line_item_incomplete` | warning |
| no amounts at all | `no_monetary_data` | status `failed` |

Status: `failed` if nothing monetary was extracted; `needs_review` if any error; otherwise `valid`
(warnings are still listed).

## Web UI

React + TypeScript + Tailwind, no UI kit; fonts (Space Grotesk, JetBrains Mono) are bundled, so the
page loads nothing from third-party hosts and works under a strict Content-Security-Policy.

- **Extract**: drag & drop (or keyboard) upload with client-side type/size checks, live progress, the
  original document, and the result as **Fields** / **JSON** tabs. Fields with a problem are
  highlighted with the exact rule that failed; line items, totals (the total turns red on a
  mismatch) and a validation checklist follow. Export CSV, Copy JSON, New invoice.
- **History**: every processed invoice with a status filter; click one to open it. Each invoice has a
  shareable `#/invoice/<id>` link.
- **API**: how to call the API directly (curl example, endpoint list, link to Swagger). The UI never
  shows an API key.
- **Docs** opens the interactive API docs served by the API itself (`<host>:8000/docs`; override with
  `VITE_DOCS_URL` at build time).
- Dark theme by default (as designed), light theme on request; responsive; keyboard usable, visible
  focus, labelled controls, screen-reader announcements for progress and results.

The progress steps are **real**: the UI calls `POST /invoices/stream`, the backend reports each stage
as it starts (validating, extracting text — and whether OCR was needed — calling the LLM, validating
numbers, saving), and the upload percentage comes from the browser's upload events. There are no
timers pretending to be progress. The validation checklist only groups verdicts the backend already
computed (and says "could not be checked" when the document lacked the data): the browser never redoes
money arithmetic.

### Screenshots

Captured by `scripts/ui_check.py`, a Playwright script that also asserts the main flows in a real
browser. They were taken against the stubbed AI step, so model and token fields show `STUB` / “—”; run
the same script against a stack with a real key to regenerate them.

| | |
|---|---|
| ![Progress](docs/screenshots/02-progress.png) **Live progress, real stages** | ![Valid](docs/screenshots/03-result-valid.png) **Valid invoice** |
| ![Needs review](docs/screenshots/05-result-needs-review.png) **Needs review: failed checks explained** | ![JSON](docs/screenshots/04-json-tab.png) **JSON tab** |
| ![OCR](docs/screenshots/06-result-ocr.png) **Scanned image via OCR** | ![Duplicate](docs/screenshots/07-duplicate.png) **Already processed (no new AI call)** |
| ![Error](docs/screenshots/08-error-unreadable.png) **Unreadable document** | ![History](docs/screenshots/09-history.png) **History with filter** |
| ![Light](docs/screenshots/12-light.png) **Light theme** | ![API](docs/screenshots/10-api.png) **API page** |

<img src="docs/screenshots/13-mobile.png" alt="Phone layout" width="260">

The hero image and the GitHub social preview (`docs/banner.png`, `docs/social-preview.png`, upload the
latter under *Settings → Social preview*) are rendered from `scripts/banner/banner.html` with
`python scripts/render_banner.py`; the JSON in the artwork is sample data.

## Design decisions

- **Validation is code, not the LLM.** The model is told to copy numbers exactly as printed and
  never to "fix" them, so the arithmetic checks see what the document says. A model that silently
  corrected a wrong total would hide exactly the errors this project exists to catch.
- **Money as `Decimal`, JSON as strings.** JSON numbers would turn into binary floats on the way.
  The Structured Outputs schema declares money fields as `string|null` and Pydantic converts them.
- **Dates and currency stay strings in the LLM schema** so a malformed value becomes a validation
  issue (`needs_review`) instead of failing the whole extraction.
- **Duplicates are decided before the expensive work**, and concurrent identical uploads are
  serialised with a PostgreSQL advisory lock keyed by the file hash, so only one request pays for
  OCR + LLM (verified by a test against real PostgreSQL: 4 simultaneous uploads → 1 LLM call; without
  the lock: 4). The `UNIQUE(file_hash)` constraint remains as a safety net. Trade-off: that request
  holds a DB connection while the pipeline runs, so the pool is sized for it (10 + 10 overflow).
- **Prompt injection.** The invoice text is untrusted. The system prompt says so, the document is
  wrapped in per-request random boundary markers, and structurally the model has no tools and can
  only emit data matching the schema. This reduces risk; it does not make it zero.
- **Retries/timeouts** use the OpenAI SDK's built-in exponential backoff (`OPENAI_MAX_RETRIES`,
  `OPENAI_TIMEOUT_SECONDS`) instead of hand-written loops. Failures become `502` with a clean body;
  nothing is stored on failure, so a retry is never mistaken for a duplicate. `store=False` is sent
  so OpenAI does not keep response data.
- **The original file is stored** (in PostgreSQL, `bytea`, loaded lazily) so the UI can show it next to
  the data. For a larger deployment object storage would be the better home.
- **CSV export neutralises spreadsheet formulas** in text cells (leading `=`, `+`, `-`, `@`), because
  invoice text is attacker-controlled.
- **Migrations are a separate one-shot compose service**, so API replicas never race to migrate.

### Why the web container proxies the API key

A browser app cannot keep a secret: anything bundled into JavaScript, or sent from the browser, is
visible to every visitor. So the key is **not** in the frontend at all. The nginx container serves the
static build and forwards `/api/*` to the backend, setting `X-API-Key` itself from its own
environment (`API_KEY`, rendered into the nginx config at container start). Whatever key a client
sends is overwritten. I verified that the key is absent from every file nginx serves, and that the
API still answers `401` when called directly without it.

The consequence to be aware of: **anyone who can reach the web container can use the API through it**.
That is fine for a local demo; for anything shared you would put real authentication (SSO, basic
auth, a VPN) in front of nginx. The key must not contain `$`, quotes or spaces.

## Configuration

See [.env.example](.env.example). Key variables:

| Variable | Default | Meaning |
|---|---|---|
| `API_KEY` | – (required) | secret for the `X-API-Key` header |
| `OPENAI_API_KEY` | – | without it, extraction returns `503` |
| `OPENAI_MODEL` | `gpt-6-luna` | the cheapest model listed on OpenAI's models page when this was written; check it against your account |
| `OPENAI_TIMEOUT_SECONDS` / `OPENAI_MAX_RETRIES` | `60` / `2` | per request |
| `MAX_UPLOAD_MB` / `MAX_PDF_PAGES` | `10` / `5` | upload limits (the UI pre-check uses `VITE_MAX_UPLOAD_MB`, default 10) |
| `OCR_LANGUAGES` | `eng` | Tesseract languages, e.g. `eng+rus` (must be installed) |
| `ENABLE_DOCS` | `true` | serve `/docs` and `/openapi.json` without a key |
| `TESSERACT_CMD` | – | path to the binary if it is not on `PATH` (Windows) |

## Local development

```bash
python -m venv .venv && . .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
docker compose up -d db                                # PostgreSQL on localhost:5433
cp .env.example .env                                   # set API_KEY, OPENAI_API_KEY (+ TESSERACT_CMD on Windows)
alembic upgrade head
uvicorn app.main:app --reload

cd frontend && npm ci && npm run dev                   # http://localhost:5173, proxies /api (key read from ../.env)
```

Python 3.9+ is supported (the code uses `from __future__ import annotations`). Tesseract must be
installed locally for OCR.

## Tests

```bash
pytest                                  # backend: no network, no OpenAI; OCR tests use real Tesseract
pytest -m integration -s                # OPTIONAL: calls the REAL OpenAI API (needs OPENAI_API_KEY, costs a little)
cd frontend && npm test                 # frontend unit tests (vitest)

# Same API tests on real PostgreSQL, plus the concurrent-duplicate tests (skipped on SQLite):
docker compose exec db psql -U invoice -d invoiceextract -c "CREATE DATABASE invoiceextract_test"
TEST_DATABASE_URL=postgresql+psycopg://invoice:invoice@localhost:5433/invoiceextract_test pytest

# Browser check of the real UI + screenshots (needs Edge or Chrome installed):
pip install -r scripts/requirements.txt
python scripts/ui_check.py --base-url http://localhost:8080 --out docs/screenshots
```

The LLM client sits behind a small interface, so the backend tests use a fake and never touch the
network. The synthetic sample invoices (`tests/samples`, regenerate with
`python tests/samples/generate_samples.py`) contain no real data.

The validation rules are the most heavily tested part (boundary cases around the 0.01 tolerance,
missing data, bad dates and currencies).

## Known limitations

- **Accuracy is unmeasured.** There is no benchmark on real invoices, and OCR was only tried on clean
  synthetic scans. Poor scans, skew, stamps, handwriting and unusual layouts will degrade results.
- **The live OpenAI path** is covered by unit tests with a fake client and by an optional integration
  test; always run `pytest -m integration` with your key after changing the model or the SDK.
- **Validation catches inconsistent numbers, not wrong-but-consistent ones**: if the model misreads a
  digit and the totals still happen to add up, the invoice is reported `valid`.
- **Discounts, shipping and multi-tax invoices** whose arithmetic is not "lines → subtotal + tax →
  total" are flagged `needs_review` rather than understood.
- **Multi-page support is basic**: pages are concatenated into one text; max 5 pages, 10 MB, and the
  extracted text must fit in `MAX_LLM_INPUT_CHARS` (40 000), otherwise the upload is rejected.
- **One invoice per file**; no batch upload, no editing/correcting extracted fields in the UI (the
  fields only look like a form), no user accounts, no per-user data separation, no rate limiting.
- **Concurrent identical uploads wait for each other** (advisory lock) and hold a DB connection
  meanwhile; very many simultaneous uploads need a larger pool or a queue.
- **Single shared API key**; the Docker UI proxy gives everybody who can reach it full access.
- **Stored documents and extracted text are kept indefinitely** (they can contain personal data);
  there is no retention policy or deletion endpoint.
- The PDF preview relies on the browser's built-in PDF viewer; zoom behaviour differs between browsers.
- The currency list is a static ISO 4217 subset (kept `BGN` and `HRK` for older invoices).
