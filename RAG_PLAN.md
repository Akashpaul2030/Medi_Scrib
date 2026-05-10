# Medi_Scrib — RAG Architecture Plan

> Companion to `MVP_PLAN.md`. That file covers the core scribe (text → SOAP).
> This file covers everything built on top: storage, retrieval, agent memory.
> Treat this as the source of truth for RAG scope before adding anything.

**Status**: planning
**Last updated**: 2026-05-09
**Owner**: Akash

---

## 1. What problem this solves

The current system is stateless. Every note is generated and thrown away. No memory, no search, no learning from accumulated data.

This plan adds three layers on top of the existing structurer:

| Layer | Technology | What it enables |
|---|---|---|
| Storage + search | Qdrant Cloud | Query over all past SOAP notes |
| Self-correcting retrieval | LangGraph (CRAG) | Grades retrieval quality before answering; rewrites weak queries |
| Agent memory across sessions | Hindsight (via MCP) | Remembers patient history, preferences, patterns across visits |

These are added in phases — not all at once.

---

## 2. Full target architecture

```
Raw clinical text (paste / file upload)
          │
          ▼
   ┌─────────────┐
   │   /ingest   │  (existing — Docling, PDF/DOCX → markdown)
   └──────┬──────┘
          │ markdown text
          ▼
   ┌─────────────┐
   │  /structure │  (existing — DeepSeek + Instructor → SOAPNote JSON)
   └──────┬──────┘
          │ SOAPNote
          ├────────────────────────────────────┐
          │                                    │
          ▼                                    ▼
   ┌─────────────────┐              ┌──────────────────┐
   │  Qdrant Cloud   │              │  Postgres (meta) │
   │  (vector store) │              │  (users, audit)  │
   │  dense embed +  │              └──────────────────┘
   │  BM25 sparse    │
   └────────┬────────┘
            │
     ┌──────┴──────────────────────────────┐
     │                                     │
     ▼                                     ▼
┌──────────────┐                 ┌──────────────────────┐
│  /search     │                 │  LangGraph CRAG       │
│  (semantic   │                 │  retrieve → grade     │
│   lookup)    │                 │  → rewrite → generate │
└──────────────┘                 └──────────┬───────────┘
                                            │
                                            ▼
                                 ┌──────────────────────┐
                                 │  Hindsight MCP        │
                                 │  retain / recall /    │
                                 │  reflect (per patient)│
                                 └──────────────────────┘
```

---

## 3. Phase roadmap

### Phase 1 — Storage (build now)
**Goal:** every structured SOAP note is saved and searchable.

What gets built:
- `api/vector_store.py` — Qdrant client, collection setup, save + search
- `POST /structure` saves note to Qdrant after extraction (background, non-blocking)
- `POST /search` — semantic search over stored notes
- `GET /notes` — list recent notes

Stack: Qdrant Cloud free tier + FastEmbed (local embedding, no extra API cost)

**Done when:** paste a note, structure it, search for it by symptom keyword, get it back.

---

### Phase 2 — Hybrid retrieval
**Goal:** medical terminology searches stop missing exact drug/diagnosis names.

What changes:
- Enable sparse vectors (BM25) in Qdrant collection
- Encode both dense + sparse on save and on search
- Search uses `query_points` with fusion mode `RRF`

Stack: `qdrant-client[fastembed]` already supports sparse via `BAAI/bge-small-en-v1.5` + `prithivida/Splade_PP_en_v1`

**Done when:** searching "escitalopram" returns notes that mention "Lexapro" (semantic) AND notes that mention the exact word (BM25).

---

### Phase 3 — LangGraph CRAG (self-correcting retrieval)
**Goal:** the system grades its own retrieval quality and rewrites bad queries before answering.

What gets built:
- `api/rag_graph.py` — LangGraph state machine
- `POST /ask` — question-answering endpoint over stored notes

The CRAG graph for medical context:

```
START
  │
  ▼
retrieve (Qdrant hybrid search)
  │
  ▼
grade_documents (LLM grades relevance 0–1)
  │
  ├── score < 0.5 → rewrite_query → retrieve_clinical_guidelines → generate
  │                                  (fall back to embedded guidelines, NOT web)
  │
  └── score ≥ 0.5 → generate
                        │
                        ▼
                  hallucination_check (is answer grounded in retrieved context?)
                        │
                        ├── fail → flag_for_review
                        └── pass → END
```

Key difference from generic CRAG: fallback is **clinical guidelines** (embedded at startup),
not open web search. Medical answers must be grounded in trusted sources only.

Dependencies to add:
```
langgraph>=0.2
langchain-core>=0.3
langchain-openai>=0.2   # works with DeepSeek's OpenAI-compatible API
```

> **LangGraph skill available:** Claude has `llm-application-dev-langchain-agent` skill.
> Invoke it when building `api/rag_graph.py` for production-grade LangGraph patterns.

**Done when:** asking "which patients had mood episodes on lamotrigine?" returns grounded answers with source references, not hallucinations.

---

### Phase 4 — Hindsight SDK (patient memory)
**Goal:** the scribe remembers patient history across sessions — mood trends, medication changes, treatment responses — without the clinician re-entering context each visit.

This uses Hindsight's **Python SDK directly** in the FastAPI backend. No MCP — that's an AI agent interface. This is a backend service calling an API.

#### What Hindsight provides

| Operation | What it does | Medical use |
|---|---|---|
| `retain()` | Stores a memory in the bank | "Patient reported tremor on lithium 300mg" |
| `recall()` | TEMPR 4-way search (semantic + BM25 + graph + temporal) | "What did we try for this patient's insomnia?" |
| `reflect()` | Reasons over memories with mission + directives | "Summarise mood trajectory over 6 visits" |

#### TEMPR retrieval — why it matters for psychiatry

| Strategy | Medical relevance |
|---|---|
| Semantic | Conceptual matches — "agitation" finds "psychomotor restlessness" |
| Keyword (BM25) | Drug names, diagnosis codes — "sertraline 100mg" exact match |
| Graph | Entity relationships — drug → side effect → discontinuation chain |
| Temporal | "Last spring", "before the lithium trial", date-range queries |

#### How it integrates into `/structure`

The `/structure` endpoint gains an optional `patient_id`. When provided:

```
POST /structure  {text, patient_id}
         │
         ├─ 1. recall(patient_id) → prior observations from Hindsight
         │
         ├─ 2. inject history into system prompt context
         │       "Prior visits: patient switched from escitalopram to sertraline
         │        3 months ago due to sexual side effects. PHQ-9 trending down."
         │
         ├─ 3. DeepSeek generates SOAP (context-aware)
         │
         ├─ 4. retain() key observations from the new note
         │       → "Sertraline 100mg tolerated well at week 12"
         │       → "PHQ-9 score 8, down from 14 at intake"
         │
         └─ 5. Return SOAPNote (unchanged response shape)
```

#### `api/memory.py` — SDK usage pattern

```python
import os
from hindsight import MemoryBank  # pip install hindsight-sdk

_bank = MemoryBank(
    api_key=os.getenv("HINDSIGHT_API_KEY"),
    bank_id=os.getenv("HINDSIGHT_BANK_ID"),
)

def recall_patient_history(patient_id: str) -> str:
    results = _bank.recall(
        query=f"patient {patient_id} history medications diagnoses",
        limit=5,
    )
    if not results:
        return ""
    return "\n".join(r.content for r in results)

def retain_observations(patient_id: str, note: SOAPNote) -> None:
    for med in note.medications_prescribed:
        _bank.retain(
            content=f"Patient {patient_id}: {med.name} {med.dose} {med.frequency}",
            metadata={"patient_id": patient_id, "type": "medication"},
        )
    for dx in note.assessment:
        _bank.retain(
            content=f"Patient {patient_id}: {dx.description} ({dx.status})",
            metadata={"patient_id": patient_id, "type": "diagnosis"},
        )
    for flag in note.flags_for_review:
        _bank.retain(
            content=f"Patient {patient_id} flag: {flag}",
            metadata={"patient_id": patient_id, "type": "flag"},
        )

def reflect_patient_summary(patient_id: str) -> str:
    return _bank.reflect(
        query=f"Summarise the mood trajectory and treatment history for patient {patient_id}",
    )
```

#### Memory bank config for psychiatry (set once via Hindsight dashboard)

```python
{
    "mission": "I am a psychiatric documentation assistant. I track medication "
               "responses, mood patterns, side effects, and treatment changes "
               "over time. I prioritise patient safety and clinical accuracy.",
    "directives": [
        "Never infer diagnoses not stated by the clinician",
        "Always cite the source note when recalling a fact",
        "Flag contradictions between current note and prior memory for clinician review",
    ],
    "disposition": {
        "skepticism": 4,   # high — no hallucinated clinical facts
        "literalism": 5,   # maximum — preserve exact clinical phrasing
        "empathy": 2,      # low — documentation tool, not a chatbot
    }
}
```

#### What NOT to use Hindsight for

- Not the primary note store — Qdrant holds full SOAP records.
- Hindsight holds **observations and patterns** (what we've learned about this patient).
- They are complementary: Qdrant = raw structured notes, Hindsight = distilled memory.

#### HIPAA note

Hindsight is a third-party SaaS. Do **not** send real PHI to it until:
- You have verified their BAA availability
- Or you self-host their open-source stack

Use with synthetic `patient_id` values only at MVP stage.

---

## 4. File changes per phase

### Phase 1 files
```
api/
├── vector_store.py        ← NEW: Qdrant client, save_note(), search_notes()
├── schemas.py             ← ADD: NoteRecord, SearchResult, SearchRequest models
├── main.py                ← ADD: /search, /notes endpoints; wire save into /structure
└── requirements.txt       ← ADD: qdrant-client[fastembed]
.env.example               ← ADD: QDRANT_URL, QDRANT_API_KEY
```

### Phase 2 files
```
api/
└── vector_store.py        ← UPDATE: enable sparse vectors, switch to hybrid search
```

### Phase 3 files
```
api/
├── rag_graph.py           ← NEW: LangGraph CRAG state machine
├── main.py                ← ADD: /ask endpoint
└── requirements.txt       ← ADD: langgraph, langchain-core, langchain-openai
data/
└── guidelines/            ← NEW: embedded clinical guidelines for fallback retrieval
```

### Phase 4 files
```
api/
├── memory.py              ← NEW: Hindsight SDK wrapper (retain, recall, reflect)
├── schemas.py             ← ADD: patient_id field to StructureRequest
├── structure.py           ← UPDATE: inject recalled history into system prompt
└── main.py                ← UPDATE: /structure calls retain after structuring
requirements.txt           ← ADD: hindsight-sdk
```

---

## 5. Environment variables (all phases)

```bash
# Phase 1 — Qdrant
QDRANT_URL=https://your-cluster.qdrant.io
QDRANT_API_KEY=your-qdrant-api-key
QDRANT_COLLECTION=soap_notes

# Existing
DEEPSEEK_API_KEY=your-deepseek-key

# Phase 4 — Hindsight SDK (add when ready)
HINDSIGHT_API_KEY=your-hindsight-key
HINDSIGHT_BANK_ID=your-memory-bank-id
# patient_id is passed per-request from frontend — not an env var
```

---

## 6. Qdrant collection design

```python
# Collection: "soap_notes"
# Vector: dense embedding of combined SOAP text (384-dim, FastEmbed)
# Payload fields (filterable):
{
    "note_id": "uuid",
    "created_at": "2026-05-09T10:30:00Z",
    "chief_complaint": "Follow-up for depression and anxiety",
    "subjective": "...",
    "objective": "...",
    "plan": "...",
    "follow_up": "2 weeks",
    "assessment": [{"description": "MDD", "status": "active"}],
    "medications": [{"name": "sertraline", "dose": "100mg", ...}],
    "flags_for_review": ["..."],
    "raw_text_length": 1240,
}
```

Text embedded = `chief_complaint + " " + subjective + " " + assessment_text + " " + plan`

Reason: these four fields carry the most clinical signal. Objective (MSE observations) is
stored as payload but excluded from the embedding to reduce noise.

---

## 7. Evaluation (RAGAS)

Wire this into CI when Phase 3 (LangGraph) ships.

```python
from ragas import evaluate
from datasets import Dataset

# Metrics that matter for medical RAG
# faithfulness    — is the answer grounded in retrieved notes? (hallucination check)
# answer_relevancy — does it answer the clinical question?
# context_precision — did we retrieve the right notes, not irrelevant ones?
```

Threshold targets for MVP:
- `faithfulness` ≥ 0.90 (medical — cannot tolerate invented facts)
- `context_precision` ≥ 0.80
- `answer_relevancy` ≥ 0.75

Run on synthetic cases only until HIPAA is in place.

---

## 8. What this plan deliberately does NOT do

- Real-time EHR sync (out of scope until 5+ customers demand it)
- Fine-tuning on retrieved notes (revisit at 1,000+ notes accumulated)
- Audio transcription before structuring (separate ASR pipeline)
- Multi-patient graph (LightRAG territory — revisit at Phase 5+)
- Open web search fallback in CRAG (clinical safety — guidelines only)
- Deploy Hindsight self-hosted (only if SaaS BAA is unavailable at HIPAA stage)

---

## 9. Build sequence (don't skip steps)

```
[NOW]     Phase 1 — Qdrant storage + /search endpoint
              ↓
[+2 weeks] Phase 2 — Hybrid BM25 + vector search
              ↓
[+1 month] Phase 3 — LangGraph CRAG + /ask endpoint
              ↓
[+2 months] Phase 4 — Hindsight MCP agent memory
              ↓  (only after first paying clinician)
[+3 months] HIPAA review — BAA, PHI handling, provider audit
```

---

## 10. One-line summary per phase

- **Phase 1**: Store every SOAP, make it searchable by meaning.
- **Phase 2**: Make medical term search exact AND semantic.
- **Phase 3**: Make the system grade and correct its own retrieval before answering.
- **Phase 4**: Give the scribe memory of each patient across visits using Hindsight SDK (retain/recall/reflect called directly from FastAPI).
