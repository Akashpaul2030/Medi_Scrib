# Medi_Scrib

**AI medical scribe for outpatient psychiatry.**  
Paste a clinical dictation — get a structured SOAP note in under 15 seconds.  
Search and ask questions across all your past notes.

---

## What it does

| Feature | Description |
|---|---|
| **Structure** | Free-text dictation → structured SOAP note (Chief Complaint, Subjective, Objective, Assessment, Plan, Medications, Flags) |
| **Ingest** | Upload PDF, DOCX, PPTX, HTML, or TXT — parsed to text via Docling, then structured |
| **Search** | Semantic search over all stored notes — finds relevant cases by meaning, not just keywords |
| **Ask** | Natural language Q&A across your note history — "which patients were on sertraline?" returns grounded answers with source citations |
| **History** | Browse recent notes, click any to reload the full SOAP instantly |

---

## Demo

**Structure a note**

Paste a clinical dictation → click **Structure note** → edit inline → copy as Markdown or download JSON.

**Ask your notes**

> "which patients were referred for neuropsychological evaluation?"

Returns: grounded answer + 4 source notes with clickable rows that reload the full SOAP.

---

## Architecture

```
Clinical free-text
       │
       ▼
  POST /ingest          ← Docling (PDF/DOCX → markdown)
       │
       ▼
  POST /structure       ← DeepSeek + Instructor → SOAPNote JSON
       │                   (background save to Qdrant)
       ▼
  Qdrant Cloud          ← vector store (FastEmbed dense embeddings)
       │
   ┌───┴────────────────────────┐
   ▼                            ▼
POST /search             POST /ask
(semantic search)        (LangGraph CRAG)
                          retrieve → grade → rewrite? → generate → fact-check
```

**CRAG design:** self-correcting retrieval — grades document relevance before generating,
rewrites the query if retrieval is weak (max 1 attempt), fact-checks the final answer.
No web search fallback — answers are grounded in stored clinical records only.

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 14 (App Router) + Tailwind CSS |
| Backend | FastAPI + Pydantic + Instructor |
| LLM | DeepSeek (`deepseek-chat`) via OpenAI-compatible API |
| Structuring | Instructor (JSON mode) + 3-attempt exponential backoff |
| File parsing | Docling (PDF, DOCX, PPTX, HTML, MD, TXT — up to 20 MB) |
| Vector store | Qdrant Cloud (free tier) + FastEmbed `BAAI/bge-small-en-v1.5` |
| RAG orchestration | LangGraph 0.2 (CRAG state machine) |
| Embeddings | FastEmbed (local, no OpenAI key needed) |

---

## Project layout

```
├── api/
│   ├── main.py           # FastAPI app — all endpoints
│   ├── schemas.py        # Pydantic models (SOAPNote, RAG responses)
│   ├── structure.py      # DeepSeek + Instructor extraction
│   ├── ingest.py         # Docling file parsing
│   ├── vector_store.py   # Qdrant client (save, search, list, retrieve)
│   ├── rag_graph.py      # LangGraph CRAG state machine
│   └── requirements.txt
├── web/
│   ├── app/app/page.tsx  # Product UI (dictation + SOAP + history sidebar)
│   └── lib/
│       ├── types.ts      # TypeScript mirrors of Pydantic schemas
│       └── markdown.ts   # SOAPNote → Markdown renderer
├── synthetic/            # Synthetic test cases (case_NNN.txt + expected.json)
├── tests/                # Pytest suite (parametrized over synthetic cases)
├── MVP_PLAN.md           # Product and deployment plan
└── RAG_PLAN.md           # RAG architecture plan (4 phases)
```

---

## API endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `POST` | `/structure` | `{text}` → `SOAPNote` JSON |
| `POST` | `/ingest` | File upload → markdown text |
| `POST` | `/search` | `{query, limit}` → semantic search results |
| `GET` | `/notes` | 20 most recent stored notes |
| `GET` | `/notes/{note_id}` | Full SOAPNote by ID |
| `POST` | `/ask` | `{question}` → grounded answer + sources |

---

## Local setup

### Prerequisites

- Python 3.11+
- Node.js 18+
- A [Qdrant Cloud](https://cloud.qdrant.io) free cluster (takes 2 minutes to create)
- A DeepSeek API key from [platform.deepseek.com](https://platform.deepseek.com)

### Backend

```bash
# from repo root
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS / Linux

pip install -r api/requirements.txt

cp .env.example .env
# fill in DEEPSEEK_API_KEY, QDRANT_URL, QDRANT_API_KEY, QDRANT_COLLECTION

uvicorn api.main:app --reload
# → http://localhost:8000
# → http://localhost:8000/docs  (Swagger UI)
```

### Frontend

```bash
cd web
npm install
npm run dev
# → http://localhost:3000/app
```

### Tests

```bash
# DEEPSEEK_API_KEY must be set — suite auto-skips if missing
pytest -v
pytest tests/test_extraction.py -v          # extraction only
pytest -k case_001                           # single case
```

Tests hit the real DeepSeek API — every run costs tokens. Non-deterministic by design.

---

## Environment variables

```bash
# Required
DEEPSEEK_API_KEY=sk-...

# Required for RAG features
QDRANT_URL=https://your-cluster.qdrant.io
QDRANT_API_KEY=your-qdrant-api-key
QDRANT_COLLECTION=soap_notes          # created automatically on startup

# Optional (frontend)
NEXT_PUBLIC_API_URL=http://localhost:8000   # defaults to this if unset
```

---

## SOAP note schema

Every structured note contains:

```json
{
  "chief_complaint": "Follow-up for major depressive disorder",
  "subjective": "Patient reports improved sleep on sertraline 100mg...",
  "objective": "Alert, cooperative. Mood euthymic, affect congruent...",
  "assessment": [
    { "description": "Recurrent major depressive disorder", "status": "active" },
    { "description": "Generalized anxiety disorder", "status": "active" }
  ],
  "plan": "Continue sertraline 100mg daily. Add hydroxyzine 25mg PRN...",
  "medications_prescribed": [
    { "name": "sertraline", "dose": "100 mg", "route": "PO", "frequency": "daily" }
  ],
  "follow_up": "6 weeks",
  "flags_for_review": ["Hydroxyzine dose not confirmed by patient weight"]
}
```

Field descriptions in `api/schemas.py` are passed to the LLM as part of the JSON schema —
they directly influence extraction quality. Edit them carefully.

---

## Dependency notes

These are pinned intentionally — do not upgrade without testing on Windows:

| Package | Pinned | Reason |
|---|---|---|
| `fastembed` | 0.8.0 | Compatible with `huggingface-hub` 1.x (required by Docling) |
| `onnxruntime` | 1.19.2 | Windows DLL compatibility |

---

## Roadmap

- [x] SOAP extraction (text → structured JSON)
- [x] File ingestion (PDF, DOCX → text → SOAP)
- [x] Qdrant vector store (save every note, semantic search)
- [x] History panel + note retrieval in frontend
- [x] LangGraph CRAG (`/ask` endpoint with self-correcting retrieval)
- [x] Ask tab in frontend (grounded answers with source citations)
- [ ] Hybrid BM25 + vector search (exact drug name matching)
- [ ] RAGAS evaluation in CI
- [ ] Hindsight SDK — patient memory across sessions
- [ ] Auth (magic link)
- [ ] HIPAA / BAA compliance (triggered by first real patient data)

---

## License

MIT
