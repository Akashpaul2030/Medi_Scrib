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
`.env` at repo root is loaded by both `api/structure.py` and `tests/test_extraction.py`. Required key: `DEEPSEEK_API_KEY`. Frontend reads `NEXT_PUBLIC_API_URL` (defaults to `http://localhost:8000`).

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

### Things to know that aren't obvious from the code

- The `ingest` endpoint writes the upload to a `NamedTemporaryFile` and unlinks it in `finally`. Docling needs a real path on disk; don't refactor it to read from the in-memory blob.
- `docling` pulls in `torch` + `torchvision` (see `api/requirements.txt`) — installs are large and slow. OCR is disabled (`do_ocr=False`) on purpose for MVP speed; turning it on changes latency materially.
- CORS in `api/main.py` is hardcoded to `localhost:3000` and `localhost:3001`. When the frontend dev server picks a different port, add it here rather than using `*`.
- `design_pkg/` holds design assets for the landing page; it is not imported by runtime code.
