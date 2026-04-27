# Medi_Scrib

Medical scribe MVP — turns unstructured clinical text into a structured SOAP note.

## Stack
- **API:** FastAPI (Python) — see `api/`
- **Web:** Next.js + TypeScript + Tailwind — see `web/`
- **Model:** DeepSeek (configurable via `DEEPSEEK_API_KEY`)

## Setup

### Backend
```bash
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r api/requirements.txt
cp .env.example .env            # then fill in DEEPSEEK_API_KEY
uvicorn api.main:app --reload
```

### Frontend
```bash
cd web
npm install
npm run dev
```

## Project layout
```
api/         FastAPI service (ingest, structure, schemas)
web/         Next.js frontend
synthetic/   Synthetic test data
tests/       Pytest suite
design_pkg/  Design assets
MVP_PLAN.md  Product/MVP plan
```
