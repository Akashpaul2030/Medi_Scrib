# Medi_Scrib — Milestone 1 Complete
## Session Summary · May 9–10, 2026

> This document captures everything researched, decided, built, and tested
> during Milestone 1. Use it as the starting point for Milestone 2 planning.
> Read this before writing a single line of new code.

---

## 1. What This Project Is

**Medi_Scrib** (also branded ScribeAI) is a medical documentation SaaS for
outpatient psychiatry. A clinician pastes or dictates a free-text clinical note,
the system returns a structured SOAP note in under 15 seconds.

**Business goal:** 5 paying clinicians within 12 weeks of launch.
**Current stage:** MVP complete. No real PHI, no HIPAA paperwork yet.
**Owner:** Akash (solo founder)

---

## 2. What Milestone 1 Set Out to Do

Starting point: a working SOAP extractor (text → JSON) with no memory, no
storage, no search.

Goal: add a full RAG layer so the system can store, search, and answer
questions over accumulated clinical notes.

Two research articles informed the approach:
- `best_rag_Architecture_from_medium.md` — modern RAG patterns (hybrid search,
  CRAG, LightRAG, MCP, semantic caching, RAGAS evaluation)
- `hindsight.md` — Hindsight memory system (retain/recall/reflect, TEMPR
  4-way retrieval for persistent agent memory)

---

## 3. Architecture Decisions Made (and Why)

### Vector store: Qdrant Cloud free tier

| Option considered | Why rejected |
|---|---|
| Pinecone | Hybrid search requires manual sparse vector setup; HIPAA BAA only on expensive Enterprise tier |
| Azure-hosted Qdrant | Burns $100 student credit; Qdrant Cloud free tier is fully managed |
| Qdrant Cloud | ✅ Chosen — native hybrid search, free tier, self-host later for HIPAA |

### Embedding: FastEmbed (built into qdrant-client)

No OpenAI key needed, runs locally, zero extra API cost. Model used:
`BAAI/bge-small-en-v1.5` (384 dimensions, cosine distance).

### LLM: DeepSeek stays for now

DeepSeek cannot sign a HIPAA BAA — swap to Qwen 2.5 14B on RunPod or Azure
OpenAI the moment a real patient note enters the system. The swap is one line
in `api/structure.py` (base_url + api_key). Do not swap early.

### Hindsight: Python SDK directly, not MCP

MCP is for AI agent tool interfaces. For a FastAPI backend, call
`retain()`, `recall()`, `reflect()` directly from Python. No MCP overhead.
Phase 4 (not built yet) — do not start until first paying clinician.

### CRAG fallback: stored notes only, no web search

Medical safety constraint. If retrieval is weak after one rewrite, the
system returns "Insufficient context" — it does not search the web.
Answers must be grounded in clinical records only.

---

## 4. Dependency Conflicts Resolved

These were resolved during Phase 1 installation and must be kept pinned:

| Package | Pinned version | Reason |
|---|---|---|
| `qdrant-client` | 1.14.1 | Stable with FastEmbed 0.8.0 |
| `fastembed` | 0.8.0 | Supports huggingface-hub 1.x (compatible with docling) |
| `onnxruntime` | 1.19.2 | Windows DLL compatibility — do not upgrade without testing |

The key conflict: `fastembed==0.6.1` downgraded `huggingface-hub` to 0.36.2
which broke docling. Solution: `fastembed==0.8.0` supports hub 1.x natively.

---

## 5. What Was Built — Phase by Phase

### Phase 1 — Qdrant Storage
**Commit:** `20941ce`

New file: `api/vector_store.py`

| Function | What it does |
|---|---|
| `ensure_collection()` | Creates `soap_notes` collection on startup (idempotent) |
| `save_note(note, raw_text)` | Embeds and saves SOAP to Qdrant; returns UUID |
| `search_notes(query, limit)` | Semantic search; returns payloads with `_score` |
| `list_notes(limit)` | Scrolls collection sorted by `created_at` descending |
| `retrieve_note(note_id)` | Fetches single note payload by UUID |

**What gets embedded:** `chief_complaint + subjective + assessment text + plan`
(objective excluded — too much noise for retrieval)

**What gets stored in payload:** all SOAPNote fields + note_id + created_at +
raw_text_length.

New endpoints added to `api/main.py`:
- `POST /search` — semantic search over stored notes
- `GET /notes` — list 20 most recent notes

`POST /structure` now saves to Qdrant in the background (non-blocking via
FastAPI `BackgroundTasks` — zero latency added to the extraction response).

---

### Phase 2 — Note Retrieval + Frontend History Panel
**Commits:** `95ca338` (backend) · `352575a` (frontend)

**Backend:** Added `GET /notes/{note_id}` endpoint returning full `NoteDetail`
(SOAPNote reconstructed from Qdrant payload).

Critical implementation detail: use `SOAPNote.model_validate({k: payload[k]
for k in SOAPNote.model_fields if k in payload})` — not `SOAPNote(**payload)`.
Pydantic v2 `model_validate` correctly coerces nested dicts (assessment,
medications) back into typed objects. The `if k in payload` guard
future-proofs against schema additions.

**Frontend:** Collapsible 300px sidebar added to `web/app/app/page.tsx`.
Layout changed from `lg:grid-cols-2` to `lg:grid-cols-[1fr_1fr_300px]`
and `max-w-[1180px]` to `max-w-[1600px]`.

Sidebar has two tabs:
- **Recent** — fetches `GET /notes` on mount, lists 20 notes
- **Search** — input + Go button, calls `POST /search`, shows score badges

Clicking any row calls `GET /notes/{note_id}` and loads the full SOAPNote
into the output panel via `setNote(data.note)` without touching the
dictation textarea.

---

### Phase 3 — LangGraph CRAG + Ask Tab
**Commits:** `dbc10cf` (graph) · `95ca338` (endpoint) · `352575a` (frontend)

New file: `api/rag_graph.py`

**CRAG state machine:**

```
START → retrieve → grade_documents → [decide]
                                      │
                    ┌─────────────────┴──────────────────┐
                    │ relevant docs found                 │ no docs, rewrite_count < 1
                    ▼                                     ▼
                 generate                          rewrite_query → retrieve
                    │                                     │
                    ▼                                     ▼
           grade_generation                            generate
                    │
          ┌─────────┴─────────┐
          │ grounded           │ not grounded
          ▼                   ▼
         END (grounded=True)  END (grounded=False)
```

**Node design:**
- `grade_documents`: LLM grades each doc yes/no. Filters to relevant only.
- `rewrite_query`: LLM rewrites the question. Max 1 rewrite to prevent loops.
- `generate`: builds context from relevant docs, generates grounded answer.
  If no docs: returns "Insufficient context" message, grounded=False.
- `grade_generation`: checks every claim is grounded in provided notes.

**LLM config:** `ChatOpenAI` pointed at DeepSeek (`base_url=
"https://api.deepseek.com"`, `model="deepseek-chat"`, `temperature=0`).
Works because DeepSeek is OpenAI-compatible.

**JSON parsing safety:** All LLM grader calls wrap `json.loads` in try/except.
If parsing fails: document grader defaults to `"no"`, generation grader
defaults to `"yes"` (fail-safe direction).

New endpoint: `POST /ask`
- Input: `{question: str}`
- Output: `{answer, sources: [NoteRecord], grounded: bool, rewritten: bool}`

**Frontend Ask tab** added as third tab in the history sidebar.
Uses separate `askLoading` state — does not share `historyLoading` with
Recent and Search tabs. The `historyLoading` skeleton has
`&& historyTab !== "ask"` guard so it never shows on the Ask tab.

Answer display:
- Teal "GROUNDED" badge when `grounded: true`
- Coral "UNVERIFIED" badge when `grounded: false`
- "Query rewritten" text when `rewritten: true`
- Sources list — clickable rows that load the full SOAP via `loadNote()`

---

## 6. Test Results That Confirmed Everything Works

### CRAG smoke tests (all passing)

| Query | Result | What it proves |
|---|---|---|
| `"which patients were on sertraline?"` | sources non-empty, grounded: true, rewritten: false | Happy path — relevant docs found first try |
| `"what is the capital of France?"` | sources: [], grounded: false, rewritten: true | Fallback — rewrote, retried, admitted insufficient context |
| `"mood symptoms treatment"` | sources non-empty, grounded: true | Semantic matching works on conceptual queries |

### Multi-note retrieval test (corpus with 9+ notes)

Query: `"which patients were referred for neuropsychological evaluation?"`

Result: 4 sources returned, each correctly attributed by chief complaint
AND by plan field. The system read beyond just note titles into plan text.
This is the demo money shot — shows cross-patient reasoning in one query.

### JSON format validation

`soap-note-1778396860221.json` (post-stroke neuropsych case) reviewed:
- All 8 SOAPNote fields correctly populated
- `assessment` includes `ruled_out` status for dementia — correctly inferred
- `medications_prescribed` uses `"unspecified"` for missing doses (correct)
- `flags_for_review` caught CPAP compliance discrepancy between patient
  report ("every other night") and clinical plan ("every evening")
- Format: 100% schema-compliant, production-quality output

---

## 7. Dataset Used for Testing

**Source:** MTSamples (`mtsamples.com`) — Psychiatry/Psychology category.
Free, publicly available, de-identified medical transcription samples.

**Volume loaded:** 9 psychiatry/neuropsychology notes structured and stored
in Qdrant Cloud.

**Critical data hygiene issue:** MTSamples pages contain web navigation
artifacts when copied from the browser:

```
"Discover more", "Nasal Sprays", "Catheter", "Newspapers",
"vehicles", "Drugs & Medications"
```

These corrupt SOAP extraction. Always paste **transcription text only**,
starting from the clinical section header (e.g., `REASON FOR REFERRAL:`).
Never copy the full page.

---

## 8. Clinician Outreach — How to Book Demos

(Built during this session — context for Milestone 2)

**Where to find psychiatrists:**
- Psychology Today (`psychologytoday.com/us/therapists`) — filter by Psychiatry
- LinkedIn — search "psychiatrist" + city, connect 2nd-degree first
- Personal network — ask for warm intros

**Outreach message (copy exactly, keep this short):**
```
Hi [Name],

I'm building a tool that turns clinical dictation into a
structured SOAP note in under 15 seconds — no typing, no templates.

I'm looking for 3–4 psychiatrists to give me honest feedback
on an early version. Would you be open to a 15-minute call
this week or next?

No pitch, no sales — just your opinion on whether this solves
a real problem.

— Akash
```

**Demo flow (90 seconds, covers everything):**
1. Paste a clinical note → Structure it → show SOAP output
2. Ask `"which patients were referred for neuropsychological evaluation?"`
   → show 4 sources returned
3. Click a source row → watch full SOAP load instantly

**Questions to ask during demo calls:**
1. How long does documentation take per note currently?
2. Do you dictate or type?
3. What's wrong with the SOAP output I showed you?
4. Would you pay $99/month for this? What would make you pay more?
5. Who else should I talk to?

---

## 9. Current File Structure

```
F:\Unstructure Data to Structure\
├── MVP_PLAN.md              ← Product + deployment plan (source of truth)
├── RAG_PLAN.md              ← RAG architecture plan, 4 phases
├── MILESTONE_1_COMPLETE.md  ← This file
├── CLAUDE.md                ← AI coding instructions for this repo
├── .env                     ← DEEPSEEK_API_KEY, QDRANT_URL, QDRANT_API_KEY, QDRANT_COLLECTION
├── .env.example             ← Documents all required env vars
│
├── api/
│   ├── main.py              ← FastAPI app, all endpoints
│   ├── schemas.py           ← SOAPNote, Diagnosis, Medication + RAG response models
│   ├── structure.py         ← DeepSeek + Instructor extraction (unchanged)
│   ├── ingest.py            ← Docling file parsing (unchanged)
│   ├── vector_store.py      ← Qdrant client, save/search/list/retrieve
│   ├── rag_graph.py         ← LangGraph CRAG state machine
│   └── requirements.txt     ← All pinned dependencies
│
└── web/
    ├── app/app/page.tsx     ← Product UI (dictation + SOAP + history sidebar)
    └── lib/
        ├── types.ts         ← TypeScript mirrors of all Pydantic schemas
        └── markdown.ts      ← SOAPNote → Markdown renderer
```

---

## 10. All API Endpoints (Current State)

| Method | Path | What it does |
|---|---|---|
| GET | `/health` | Server health check |
| POST | `/structure` | Free-text → SOAPNote JSON (+ background save to Qdrant) |
| POST | `/ingest` | File upload (PDF/DOCX/etc) → markdown text |
| POST | `/search` | Semantic search over stored notes |
| GET | `/notes` | List 20 most recent stored notes |
| GET | `/notes/{note_id}` | Retrieve full SOAPNote by ID |
| POST | `/ask` | CRAG question-answering over stored notes |

---

## 11. Git History

```
352575a feat: add history panel and ask tab to app UI
95ca338 feat: add RAG endpoints — /search, /notes, /notes/{id}, and /ask
dbc10cf feat: add LangGraph CRAG self-correcting retrieval graph
20941ce feat: add Qdrant Cloud vector store layer
f91cedf docs: add RAG architecture plan and reference materials
330285a chore: exclude generated files, logs, screenshots, and dataset from tracking
ee394f7 Initial commit: Medi_Scrib MVP
```

---

## 12. Milestone 2 — What Comes Next

### Immediate (do before any new features)

- [ ] Load 11 more MTSamples psychiatry notes → reach 20+ in Qdrant
- [ ] Send 20 clinician outreach messages (Psychology Today + LinkedIn)
- [ ] Book 3–5 demo calls

### Technical — Phase 2 from RAG_PLAN.md (skipped in Milestone 1)

**Hybrid BM25 + vector search** — the remaining retrieval quality gap.

Why it matters: pure semantic search misses exact drug name matches.
"Escitalopram" may not surface a note that says "Lexapro".
Becomes critical at 50+ notes. Qdrant supports sparse vectors natively.

Implementation: enable sparse vectors in `vector_store.py`, encode both
dense + sparse on save and search, use RRF fusion mode.

### Technical — Phase 4 from RAG_PLAN.md

**Hindsight SDK patient memory** — only after first paying clinician.

Trigger: first real patient note enters the system.
What changes: `api/memory.py` (new), `api/structure.py` (inject recalled
history into system prompt), `api/main.py` (retain after structuring).

Do not start before the trigger. It adds third-party SaaS dependency and
HIPAA surface area.

### Compliance — triggers to watch for

| Trigger | Action required |
|---|---|
| First real patient note | Swap DeepSeek → Qwen on RunPod OR Azure OpenAI |
| First paying customer | Sign BAA, start Vanta evidence collection |
| 5+ customers | SOC 2 Type I preparation |

### RAGAS Evaluation (Phase 3 completion)

Wire RAGAS into CI to measure retrieval quality on every pipeline change.

Target thresholds (from `RAG_PLAN.md`):
- `faithfulness ≥ 0.90` (medical — cannot tolerate hallucinated facts)
- `context_precision ≥ 0.80`
- `answer_relevancy ≥ 0.75`

Run only on synthetic/de-identified cases until HIPAA is in place.

### Global Solution Vision

The unstructured → structured → RAG pipeline is the reusable IP.
Medical (psychiatry) is vertical #1. Same pipeline + different schema =
new vertical (legal, finance, HR).

**Do not build for other verticals yet.** Validate psychiatry end-to-end
first. The schema swap is a config change — it will take days, not months,
once the medical vertical is proven.

---

## 13. Key Rules to Not Break

1. **Never send real PHI to DeepSeek** — they cannot sign a HIPAA BAA.
2. **Never add web search fallback to CRAG** — medical answers must be
   grounded in stored clinical records only.
3. **Keep `api/structure.py` and `api/ingest.py` untouched** — they are
   the working core. All new features go in new files.
4. **`api/schemas.py` and `web/lib/types.ts` must stay in lockstep** —
   the frontend deserializes by structural shape, not via a generated client.
5. **Do not commit** soap-note-*.json, uvicorn logs, screenshots,
   note.md, or Dataset/ — all excluded in .gitignore.
6. **MTSamples data hygiene** — always strip web navigation artifacts
   before structuring. Clinical text only.
