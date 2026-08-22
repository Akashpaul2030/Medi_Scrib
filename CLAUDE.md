# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: Medi_Scrib (a.k.a. ScribeAI)

Medical scribe MVP — turns unstructured clinical free-text into a structured SOAP note. Single-specialty (outpatient psychiatry), text-input only, synthetic data only at MVP stage. Full product/scope rationale lives in `MVP_PLAN.md`; treat that as the source of truth for what is in/out of scope before adding features.

## Commands

### Backend (FastAPI)
```bash
# from repo root, with .venv activated
pip install -r api/requirements.txt
uvicorn api.main:app --reload          # serves on http://localhost:8000
```

### Frontend (Next.js)
```bash
cd web
npm install
npm run dev                             # serves on http://localhost:3000
npm run build                           # production build
npm run lint                            # next lint
```

### Tests
```bash
# from repo root — DEEPSEEK_API_KEY must be set in .env or the suite skips entirely
pytest -v                               # full suite
pytest tests/test_extraction.py -v      # extraction tests only
pytest tests/test_extraction.py::test_medications_match -v   # single test
pytest -k case_001                      # filter by synthetic case id
```
Tests hit the real DeepSeek API (no mocking) — every run costs tokens and is non-deterministic. The suite auto-skips when `DEEPSEEK_API_KEY` is missing rather than failing.

### Environment
`.env` at repo root is loaded by `api/structure.py`, `api/db.py`, `api/usage.py`, `api/billing.py` and `tests/test_extraction.py`. Required keys: `DEEPSEEK_API_KEY`, `QDRANT_URL`, `QDRANT_API_KEY`, `API_JWT_SECRET`. See `.env.example` for the full list and `DEPLOY.md` for where each value comes from.

`API_JWT_SECRET` must be **identical** in `.env` and `web/.env.local` — it signs the tokens the frontend mints and the backend verifies. Mismatched values mean every request 401s.

Local sign-in without Google credentials: `ALLOW_DEV_LOGIN=true` and `NEXT_PUBLIC_ALLOW_DEV_LOGIN=true` in `web/.env.local`. Both are ignored in a production build.

## Architecture

Two-tier app with a strict contract between them:

**`api/` — FastAPI service** exposes two endpoints:
- `POST /structure` — JSON `{text}` → `SOAPNote`. The structuring path is `main.structure → structure.to_soap → Instructor → DeepSeek`.
- `POST /ingest` — multipart file upload → markdown text. Routes to `ingest.parse_to_markdown`, which uses Docling to convert PDF/DOCX/PPTX/HTML/MD/TXT (≤20 MB) to markdown. The frontend pipes the markdown back into the textarea, then calls `/structure` separately. Ingest and structure are deliberately decoupled so the user can edit the parsed text before structuring.

**`web/` — Next.js 14 (App Router) frontend**
- Marketing/landing pages live at `web/app/` (root `page.tsx`, plus `components/` for hero, pricing, etc.).
- The actual product UI is at `web/app/app/page.tsx` (note the nested `app/app/` path — this is intentional; the inner `app` is the route segment for `/app`).
- `web/lib/types.ts` mirrors `api/schemas.py`. **These two files must stay in lockstep** — the frontend deserializes the API response by structural shape, not via a generated client.
- `web/lib/markdown.ts` renders a `SOAPNote` to markdown for the copy/download buttons.

### The structuring contract (most important thing to understand)

`api/schemas.py` defines `SOAPNote` (and `Diagnosis`, `Medication`) using Pydantic with **rich `Field(description=...)`** strings. Those descriptions are not just documentation — Instructor passes them to the LLM as part of the JSON schema, so they directly steer extraction quality. Editing a description changes model behavior. Pair any schema change with synthetic-case updates in `synthetic/` and re-run `pytest`.

The system prompt in `api/structure.py` enforces conservative, no-invention behavior: only extract what was explicitly stated, flag ambiguity in `flags_for_review`, capture rule-outs explicitly with `status='ruled_out'`. Treat that prompt as part of the extraction contract — small wording changes shift outputs measurably.

The model is **DeepSeek** via the OpenAI-compatible client (`base_url="https://api.deepseek.com"`, model `deepseek-chat`). Instructor runs in `JSON` mode with `temperature=0`, wrapped in a 3-attempt exponential-backoff retry. The MVP plan calls for eventually swapping to a self-hosted Qwen 2.5 14B on a RunPod serverless endpoint — same OpenAI-compatible interface, so the swap is a base_url/api_key change in `structure.py`.

### Synthetic test cases

`synthetic/case_NNN.txt` + `case_NNN.expected.json` pairs drive the test suite. `tests/test_extraction.py` is parametrized over the `CASES` list — **add new case ids there** when adding fixtures. The assertions are intentionally fuzzy (substring/token match on med names, token-overlap on diagnosis descriptions) because the LLM rephrases freely; do not tighten them to exact-match without a reason.

### Auth and billing

Identity is a **signed bearer token, never a header**. `api/auth.py` verifies an HS256 JWT on every request; there is deliberately no `X-User-Id` fallback, so a misconfigured deploy fails closed. The token is minted server-side by `web/app/api/token/route.ts` from the NextAuth session and cached in memory by `web/lib/api.ts`, which refreshes it on expiry and retries once on a 401. All frontend calls go through `apiFetch` — do not call `fetch` against the API directly, it will 401.

Only `/health` and `/billing/config` are public. Everything else requires a token.

`api/usage.py` meters the free tier. **One structured note is one billable unit**; reading, searching, `/ask` and `/compare` are free. A user spends their monthly allowance first (`FREE_MONTHLY_NOTES`, default 10; `PAID_MONTHLY_NOTES`, default 150) and only then purchased credits, which never expire. `consume()` charges *before* the model call and `refund()` puts the unit back if the call fails — check-and-decrement happens inside one `BEGIN IMMEDIATE` transaction, so concurrent requests cannot both spend the last credit. Over quota returns **402** with the `QuotaState` as the detail body; the frontend turns that into the paywall.

`api/billing.py` uses **Paddle as merchant of record** — Stripe does not onboard merchants in Bangladesh, so Paddle is the legal seller and remits to us. It stays dormant until `PADDLE_API_KEY` is set (every endpoint but `/billing/config` returns 503). Unlike Stripe there are no inline prices: every `PADDLE_PRICE_*` must be set or checkout returns 503. Run `python scripts/paddle_setup.py` to create the catalogue and print the ids. Sandbox and production are entirely separate accounts with different keys *and* different price ids.

Three rules hold the payment path together, and all three are load-bearing:

1. **Transactions are created server-side** (`_create_checkout`), stamping the verified email into `custom_data`, so a browser cannot redirect someone else's payment onto its own account.
2. **Credit amounts derive from the paid `price_id`**, never from `custom_data` — a tampered checkout cannot mint credits because the user must actually pay for a price we recognise.
3. **Fulfilment happens only in the webhook.** The browser returning from checkout just polls `/usage`. Signatures are HMAC-SHA256 over `ts:raw_body` (the raw bytes — re-serialising the JSON breaks it) with a 5-minute replay window, and both the event id and the transaction id go into `processed_events` so a retry cannot double-credit.

Subscription webhooks identify a customer, not an email, so `billing_customers` maps `customer_id → email`; it is populated on `transaction.completed`, which is why that event must be subscribed alongside the subscription ones.

Commercial state (subscriptions, usage counters, credits) lives in SQLite via `api/db.py` — everything clinical stays in Qdrant. On Fly.io that file sits on a mounted volume; losing it costs only the usage counters, since Paddle can rebuild subscriptions.

### Things to know that aren't obvious from the code

- The `ingest` endpoint writes the upload to a `NamedTemporaryFile` and unlinks it in `finally`. Docling needs a real path on disk; don't refactor it to read from the in-memory blob.
- `docling` pulls in `torch` + `torchvision` (see `api/requirements.txt`) — installs are large and slow. OCR is disabled (`do_ocr=False`) on purpose for MVP speed; turning it on changes latency materially.
- CORS in `api/main.py` is hardcoded to `localhost:3000` and `localhost:3001`. When the frontend dev server picks a different port, add it here rather than using `*`.
- `design_pkg/` holds design assets for the landing page; it is not imported by runtime code.
