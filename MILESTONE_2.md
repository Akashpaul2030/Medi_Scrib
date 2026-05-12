# Medi_Scrib — Milestone 2 Plan
## Clinician-Ready SaaS · May 2026

> Read MILESTONE_1_COMPLETE.md before this file.
> That document covers all architecture decisions, dependency resolutions,
> and the full RAG layer already built. This file covers what comes next.
> Treat this as the execution plan — read a phase, build it, mark it done.

---

## 1. Where We Are After Milestone 1

**What is built and working:**

| Feature | Status |
|---|---|
| Free-text dictation → structured SOAP note | ✅ Done |
| File ingestion (PDF, DOCX, PPTX) | ✅ Done |
| Qdrant vector store — save every note | ✅ Done |
| Semantic search over stored notes | ✅ Done |
| History sidebar — recent + search + ask tabs | ✅ Done |
| LangGraph CRAG — /ask endpoint | ✅ Done |
| Inline editing of all SOAP fields | ✅ Done |
| Copy as Markdown + Download JSON | ✅ Done |
| 20 MTSamples psychiatry notes loaded in Qdrant | ✅ Done |

**What is blocking the first paying customer:**

| Gap | Why it blocks |
|---|---|
| No voice input | Every competing product leads with voice; psychiatrists dictate, they don't type |
| No ICD-10 codes | Clinicians need billing codes in every note |
| No PDF export | "Copy as Markdown" is a developer output, not a clinical one |
| No auth | All customers share one note pool — data isolation impossible |
| No per-user data isolation | Multi-tenancy unsafe without user_id filtering in Qdrant |

**Business goal for Milestone 2:**
First paying clinician. $99/month. One customer proves the model works.

---

## 2. What MVP_PLAN.md Said Was Out of Scope (Now Deliberately Changing)

The original `MVP_PLAN.md` excluded audio/ASR and ICD-10 codes.
That was the right call at MVP stage. Both decisions are now reversed for Milestone 2
because:

- Demo calls confirmed that psychiatrists dictate verbally — text-only input
  is the #1 friction point before payment.
- ICD-10 codes are required for billing — a note without codes is incomplete
  for clinical workflow.

Everything else in `MVP_PLAN.md` still holds. Do not build EHR integration,
mobile, or multi-tenant team management.

---

## 3. Phase Overview

```
Phase 1  Voice input (Whisper)              ← biggest demo impact
Phase 2  ICD-10 codes in Assessment         ← billing value, 2-hour build
Phase 3  PDF export                         ← EHR-compatible output
Phase 4  Auth + per-user Qdrant isolation   ← required before charging money
Phase 5  Patient labels + longitudinal view ← makes product sticky
```

Phases 1–3 can be demoed without auth. Build in order.
Phase 4 is required before accepting any payment or real patient data.
Phase 5 is the feature that makes clinicians keep paying month over month.

---

## 4. Phase 1 — Voice Input (Whisper)

**Goal:** clinician clicks a microphone button, speaks their note, text
fills the dictation textarea, then clicks Structure note.

**Why it matters:** removes the single biggest friction point. Every
competing medical scribe product (Nuance Dragon, Suki, DeepScribe) leads
with voice. Without it the product feels like a form, not a scribe.

**Done when:** speak a 30-second clinical dictation → text appears in the
textarea → click Structure → SOAP note renders. End-to-end in under 20s.

---

### 4.1 Backend — new `/transcribe` endpoint

**New file:** none. Add endpoint to `api/main.py`.

**New env var:** `OPENAI_API_KEY` (Whisper is an OpenAI API product —
separate from DeepSeek. Costs ~$0.006/minute of audio.)

```python
# api/main.py — add this endpoint
import openai as oai

@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(...)) -> dict[str, str]:
    blob = await audio.read()
    if len(blob) == 0:
        raise HTTPException(status_code=400, detail="Empty audio file")
    client = oai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    transcript = client.audio.transcriptions.create(
        model="whisper-1",
        file=(audio.filename or "audio.webm", blob, audio.content_type or "audio/webm"),
    )
    return {"text": transcript.text}
```

**Add to `api/requirements.txt`:**
```
openai>=1.30.0
```

Note: `openai` package is already likely installed transitively via
`langchain-openai`. Pin it explicitly to avoid version conflicts.

---

### 4.2 Frontend — microphone button in the Dictation panel

**File:** `web/app/app/page.tsx`

**State to add:**
```typescript
const [recording, setRecording] = useState(false);
const mediaRecorderRef = useRef<MediaRecorder | null>(null);
const chunksRef = useRef<Blob[]>([]);
```

**Function to add:**
```typescript
async function toggleRecording() {
  if (recording) {
    mediaRecorderRef.current?.stop();   // triggers ondataavailable → onstop
    setRecording(false);
    return;
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mr = new MediaRecorder(stream);
  chunksRef.current = [];
  mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
  mr.onstop = async () => {
    stream.getTracks().forEach(t => t.stop());
    const blob = new Blob(chunksRef.current, { type: "audio/webm" });
    const fd = new FormData();
    fd.append("audio", blob, "recording.webm");
    setIngesting(true);
    try {
      const res = await fetch(`${API_URL}/transcribe`, { method: "POST", body: fd });
      if (!res.ok) throw new Error(`Transcribe ${res.status}`);
      const data = await res.json() as { text: string };
      setText(data.text);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Transcription failed");
    } finally {
      setIngesting(false);
    }
  };
  mediaRecorderRef.current = mr;
  mr.start();
  setRecording(true);
}
```

**UI — add mic button next to "Upload file" in the Dictation header:**
```tsx
<button
  onClick={() => void toggleRecording()}
  disabled={ingesting}
  className={`text-[12.5px] hover:underline disabled:opacity-50 ${
    recording ? "text-coral font-semibold" : "text-teal"
  }`}
  type="button"
>
  {recording ? "● Stop recording" : "🎤 Record"}
</button>
```

---

### 4.3 Environment variable

Add to `.env` and `.env.example`:
```bash
OPENAI_API_KEY=sk-...    # used only for Whisper transcription
```

---

### 4.4 Validation

- [ ] Click Record → browser asks for mic permission → grant
- [ ] Speak 20-second clinical dictation → click Stop recording
- [ ] Text fills textarea
- [ ] Click Structure note → SOAP renders correctly from spoken dictation
- [ ] "Parsing…" state shows during transcription (reuses `ingesting` state)

---

## 5. Phase 2 — ICD-10 Codes in Assessment

**Goal:** every diagnosis in the Assessment section includes a suggested
ICD-10-CM code. Clinician can edit it before signing.

**Why it matters:** psychiatrists need ICD-10 codes for insurance billing.
Every note they submit to an insurer requires a code. Currently they have
to look up codes manually after your tool generates the note. Adding
auto-suggested codes saves 1–2 minutes per note.

**Done when:** structure a note with "major depressive disorder, recurrent,
moderate" → Assessment shows `F33.1` alongside the description.

---

### 5.1 Schema change — `api/schemas.py`

Add `icd10_code` to `Diagnosis`:

```python
class Diagnosis(BaseModel):
    description: str = Field(
        description="Diagnosis or problem stated by the clinician, e.g. "
                    "'Recurrent major depressive disorder'. Use clinical phrasing "
                    "from the dictation; do not invent diagnoses."
    )
    icd10_code: str | None = Field(
        default=None,
        description="ICD-10-CM code for this diagnosis if clearly identifiable "
                    "from the description, e.g. 'F33.1' for recurrent MDD moderate, "
                    "'F41.1' for GAD, 'F31.81' for bipolar II. Use None if the "
                    "diagnosis is too vague to code confidently — do not guess."
    )
    status: DiagnosisStatus = Field(
        description="One of 'active' (currently being treated), 'resolved' "
                    "(no longer present), or 'ruled_out' (considered and excluded). "
                    "If unclear, default to 'active' and add an entry to flags_for_review."
    )
```

No other backend changes needed. Instructor passes the updated schema to
DeepSeek automatically. The LLM knows ICD-10 codes natively.

---

### 5.2 Frontend type update — `web/lib/types.ts`

```typescript
export interface Diagnosis {
  description: string;
  icd10_code: string | null;   // ← add this
  status: "active" | "resolved" | "ruled_out";
}
```

---

### 5.3 Frontend display — `DiagnosisList` in `web/app/app/page.tsx`

In the `DiagnosisList` component, add an ICD-10 input field in the
existing `<li>` row (between description and status select):

```tsx
<input
  value={d.icd10_code ?? ""}
  onChange={(e) => update(i, { icd10_code: e.target.value.trim() || null })}
  className="w-[72px] rounded border border-transparent bg-transparent px-2 py-1
             text-[12.5px] font-mono text-mute outline-none focus:border-teal"
  placeholder="ICD-10"
/>
```

Display it as a small monospace field — narrow, after the description.

---

### 5.4 Common psychiatry ICD-10 codes (for testing)

| Diagnosis | Code |
|---|---|
| MDD, single episode, moderate | F32.1 |
| MDD, recurrent, moderate | F33.1 |
| MDD, recurrent, severe without psychosis | F33.2 |
| Generalized anxiety disorder | F41.1 |
| Bipolar I, current episode manic | F31.10 |
| Bipolar II | F31.81 |
| ADHD, combined presentation | F90.2 |
| PTSD | F43.10 |
| Panic disorder | F41.0 |
| OCD | F42.2 |
| Borderline personality disorder | F60.3 |
| Insomnia disorder | G47.00 |

---

### 5.5 Validation

- [ ] Structure the sample note (MDD + GAD case) → Assessment shows F33.1
  and F41.1 alongside descriptions
- [ ] Edit a code in the UI → updated in the note object
- [ ] "Copy as Markdown" output includes ICD-10 codes (update `web/lib/markdown.ts`)
- [ ] Vague diagnosis → `icd10_code: null` (not a hallucinated code)

---

### 5.6 Update `web/lib/markdown.ts`

In `soapToMarkdown`, update the assessment section to include the code:

```typescript
// in the assessment list rendering
`- ${d.description}${d.icd10_code ? ` (${d.icd10_code})` : ""} [${d.status}]`
```

---

## 6. Phase 3 — PDF Export

**Goal:** "Download PDF" button generates a properly formatted PDF of the
SOAP note. Output is suitable for printing or uploading to an EHR manually.

**Why it matters:** clinicians need a document they can put in their EHR.
"Copy as Markdown" and "Download JSON" are developer outputs. PDF is the
universal clinical document format.

**Done when:** click Download PDF → browser downloads a formatted PDF with
the practice name, date, and all SOAP sections in a readable layout.

---

### 6.1 Backend — new `/notes/pdf` endpoint

Use `reportlab` to generate the PDF server-side.

**Add to `api/requirements.txt`:**
```
reportlab==4.2.2
```

**New file: `api/pdf_export.py`**

```python
import io
from datetime import datetime

from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from reportlab.lib import colors

from api.schemas import SOAPNote


def soap_to_pdf(note: SOAPNote, created_at: str | None = None) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter,
                            leftMargin=inch, rightMargin=inch,
                            topMargin=inch, bottomMargin=inch)
    styles = getSampleStyleSheet()
    heading = ParagraphStyle("heading", parent=styles["Heading2"],
                             spaceAfter=4, spaceBefore=10)
    body = ParagraphStyle("body", parent=styles["Normal"],
                          fontSize=10, leading=14, spaceAfter=6)
    label = ParagraphStyle("label", parent=styles["Normal"],
                           fontSize=8, textColor=colors.grey)

    date_str = created_at or datetime.utcnow().strftime("%B %d, %Y")

    story = [
        Paragraph("SOAP NOTE", styles["Title"]),
        Paragraph(f"Generated: {date_str}", label),
        Spacer(1, 0.2 * inch),
        Paragraph("Chief Complaint", heading),
        Paragraph(note.chief_complaint, body),
        Paragraph("Subjective", heading),
        Paragraph(note.subjective, body),
        Paragraph("Objective", heading),
        Paragraph(note.objective, body),
        Paragraph("Assessment", heading),
    ]

    for dx in note.assessment:
        code = f" ({dx.icd10_code})" if getattr(dx, "icd10_code", None) else ""
        story.append(Paragraph(
            f"• {dx.description}{code} <font color='grey'>[{dx.status}]</font>", body
        ))

    story += [
        Paragraph("Plan", heading),
        Paragraph(note.plan, body),
        Paragraph("Medications Prescribed", heading),
    ]

    if note.medications_prescribed:
        med_data = [["Medication", "Dose", "Route", "Frequency"]]
        for m in note.medications_prescribed:
            med_data.append([m.name, m.dose, m.route, m.frequency])
        t = Table(med_data, colWidths=[2 * inch, 1.2 * inch, 0.8 * inch, 2 * inch])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f0f4f8")),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#d0d7de")),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(t)
    else:
        story.append(Paragraph("None documented.", body))

    if note.follow_up:
        story += [Paragraph("Follow-up", heading), Paragraph(note.follow_up, body)]

    if note.flags_for_review:
        story.append(Paragraph("Flags for Review", heading))
        for f in note.flags_for_review:
            story.append(Paragraph(f"⚠ {f}", body))

    doc.build(story)
    return buf.getvalue()
```

**New endpoint in `api/main.py`:**

```python
from fastapi.responses import Response
from api.pdf_export import soap_to_pdf

@app.post("/export/pdf")
def export_pdf(req: StructureRequest) -> Response:
    try:
        note = to_soap(req.text)   # re-structure, OR accept a SOAPNote directly
        pdf_bytes = soap_to_pdf(note)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=soap-note.pdf"},
        )
    except Exception as e:
        logger.exception("PDF export failed")
        raise HTTPException(status_code=502, detail=f"PDF export failed: {e}")
```

Better approach — accept a full `SOAPNote` payload so the clinician can
edit inline first, then export. Change the request model:

```python
class PdfExportRequest(BaseModel):
    note: SOAPNote
    created_at: str | None = None

@app.post("/export/pdf")
def export_pdf(req: PdfExportRequest) -> Response:
    pdf_bytes = soap_to_pdf(req.note, req.created_at)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=soap-note.pdf"},
    )
```

---

### 6.2 Frontend — "Download PDF" button

In `web/app/app/page.tsx`, add `downloadPdf` function alongside
`downloadJson`:

```typescript
async function downloadPdf() {
  if (!note) return;
  const res = await fetch(`${API_URL}/export/pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ note, created_at: new Date().toISOString() }),
  });
  if (!res.ok) { setError("PDF export failed"); return; }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `soap-note-${Date.now()}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
```

Add button in the output panel header (next to "Copy as Markdown" and
"Download JSON"):

```tsx
<button
  onClick={() => void downloadPdf()}
  className="btn-ghost h-8 rounded-md border border-line bg-white px-2.5
             text-[12.5px] font-medium text-ink"
>
  Download PDF
</button>
```

---

### 6.3 Validation

- [ ] Structure a note → click Download PDF → browser downloads a `.pdf`
- [ ] Open PDF — all 8 SOAP sections present
- [ ] ICD-10 codes appear next to diagnoses (from Phase 2)
- [ ] Medications render as a table
- [ ] Flags for review section shows with warning indicator

---

## 7. Phase 4 — Auth + Per-User Qdrant Isolation

**Goal:** each clinician has their own account. Their notes are invisible
to every other user. Required before charging any money or accepting real
patient notes.

**Done when:** two browser sessions logged in as different users each see
only their own notes — in history, search, and ask results.

---

### 7.1 Auth strategy — NextAuth.js magic link

No passwords. Clinician enters their email → receives a sign-in link →
clicks it → logged in. Simple, no forgotten passwords, works on all devices.

**Add to `web/`:**
```bash
npm install next-auth @auth/core
```

**New file: `web/app/api/auth/[...nextauth]/route.ts`**

```typescript
import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY,
      from: "noreply@yourdomain.com",
    }),
  ],
  callbacks: {
    session({ session, token }) {
      session.user.id = token.sub!;   // expose user ID to client
      return session;
    },
  },
});

export const { GET, POST } = handlers;
```

**New env vars for frontend (`.env.local`):**
```bash
AUTH_SECRET=<random 32-char string — run: openssl rand -hex 16>
AUTH_RESEND_KEY=re_...    # Resend free tier (3,000 emails/month)
NEXTAUTH_URL=http://localhost:3000
```

**Protect the `/app` route** — wrap `web/app/app/page.tsx` in a session
check. If not logged in, redirect to `/login`.

---

### 7.2 Pass `user_id` to every API call

Once a session exists, every fetch call from the frontend must pass the
user's ID. The cleanest approach: send it as a header.

```typescript
// in web/app/app/page.tsx — add to every fetch call
const session = await getSession();   // NextAuth client-side hook
const headers = {
  "Content-Type": "application/json",
  "X-User-Id": session?.user?.id ?? "",
};
```

---

### 7.3 Backend — read `user_id` from header

In `api/main.py`, extract the user ID from the `X-User-Id` header and
pass it to all vector store operations:

```python
from fastapi import Header

def get_user_id(x_user_id: str = Header(..., alias="X-User-Id")) -> str:
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Missing user ID")
    return x_user_id
```

Add to every endpoint that touches Qdrant:
```python
@app.post("/structure")
def structure(req: StructureRequest, background_tasks: BackgroundTasks,
              user_id: str = Depends(get_user_id)) -> SOAPNote:
    note = to_soap(req.text)
    background_tasks.add_task(save_note, note, req.text, user_id)
    return note
```

---

### 7.4 `api/vector_store.py` — add `user_id` filtering

**Every save adds `user_id` to the payload:**

```python
async def save_note(note: SOAPNote, raw_text: str, user_id: str) -> str:
    payload = {
        "user_id": user_id,   # ← add this
        "note_id": note_id,
        # ... rest unchanged
    }
```

**Every query filters by `user_id`:**

```python
from qdrant_client.models import Filter, FieldCondition, MatchValue

def _user_filter(user_id: str) -> Filter:
    return Filter(must=[FieldCondition(
        key="user_id", match=MatchValue(value=user_id)
    )])

def search_notes(query: str, user_id: str, limit: int = 5):
    return _client.query(
        collection_name=COLLECTION,
        query_text=query,
        query_filter=_user_filter(user_id),
        limit=limit,
    )

def list_notes(user_id: str, limit: int = 20):
    results, _ = _client.scroll(
        collection_name=COLLECTION,
        scroll_filter=_user_filter(user_id),
        limit=limit,
    )
    return results

def retrieve_note(note_id: str, user_id: str):
    results, _ = _client.scroll(
        collection_name=COLLECTION,
        scroll_filter=Filter(must=[
            FieldCondition(key="note_id", match=MatchValue(value=note_id)),
            FieldCondition(key="user_id", match=MatchValue(value=user_id)),
        ]),
        limit=1,
    )
    return results[0].payload if results else None
```

The `retrieve_note` change is important — it prevents a user from fetching
another user's note by guessing the UUID.

---

### 7.5 Existing notes in Qdrant (migration)

All 20 MTSamples notes in Qdrant currently have no `user_id` field.
Two options:

- **Option A (simplest):** delete the collection and re-load all 20 notes
  under your own user ID. Synthetic data — no loss.
- **Option B:** scroll all notes without `user_id`, patch them with
  `user_id = "dev"` (your account). Only needed if you want to preserve
  notes for a demo account.

Recommend Option A. The data is synthetic and re-loading takes 5 minutes.

---

### 7.6 Validation

- [ ] Sign in with email → receive magic link → click → session active
- [ ] Structure a note → it saves under your user ID
- [ ] Sign in as a different email → history is empty (cannot see first account's notes)
- [ ] `GET /notes/{note_id}` with wrong user's token → 404 (not the other user's note)

---

## 8. Phase 5 — Patient Labels + Longitudinal View

**Goal:** clinician can assign a label to a note (e.g. "Patient A" or
any code they choose). All notes for the same patient are grouped. Clicking
a patient shows all their visits in chronological order.

**Why it makes the product sticky:** notes accumulate meaning over time
when grouped by patient. A clinician with 6 months of notes for 30 patients
cannot leave — their entire patient history lives here.

**Done when:** after structuring, assign a patient label → second visit for
same patient shows both notes in order → "Compare visits" shows what changed.

---

### 8.1 Schema change — `api/schemas.py`

Add optional `patient_label` to the save path (not extracted by the LLM —
entered by the clinician):

```python
class SaveNoteRequest(BaseModel):
    note: SOAPNote
    raw_text: str
    patient_label: str | None = None   # clinician-assigned, e.g. "Patient A"
```

Store `patient_label` in the Qdrant payload alongside `user_id`.

---

### 8.2 New endpoint — `GET /patients`

```python
@app.get("/patients")
def list_patients(user_id: str = Depends(get_user_id)) -> dict:
    # scroll all notes for user, extract unique patient_labels
    # return list of {patient_label, note_count, last_visit}
```

---

### 8.3 New endpoint — `GET /patients/{label}/notes`

Returns all notes for a patient label, sorted by `created_at` ascending
(oldest first — chronological visit history).

---

### 8.4 Comparison feature — "What changed since last visit?"

When a patient has 2+ notes, add a "Compare" button. Sends the two most
recent note payloads to the LLM:

**New endpoint: `POST /compare`**

```python
class CompareRequest(BaseModel):
    note_a: SOAPNote   # earlier visit
    note_b: SOAPNote   # later visit

@app.post("/compare")
def compare(req: CompareRequest) -> dict[str, str]:
    prompt = f"""
You are comparing two psychiatric SOAP notes for the same patient.
Identify what changed between Visit A (earlier) and Visit B (later).

Focus on:
- Medication changes (added, stopped, titrated)
- Symptom trajectory (improved, worsened, unchanged)
- Diagnosis status changes
- New flags or concerns

Visit A:
{req.note_a.model_dump_json(indent=2)}

Visit B:
{req.note_b.model_dump_json(indent=2)}

Return a concise clinical summary of changes only.
"""
    result = _llm.invoke(prompt)
    return {"summary": result.content}
```

This is the Hindsight SDK use case from `RAG_PLAN.md` achieved without
the external SDK — one LLM call, zero new dependencies.

---

### 8.5 Frontend — Patient tab in the history sidebar

Add a fourth tab "Patients" to the history sidebar in
`web/app/app/page.tsx`. Shows a list of patient labels. Clicking one
expands to show all visits. "Compare last 2 visits" button appears when
a patient has 2+ notes.

---

### 8.6 Validation

- [ ] Structure 2 notes, assign both to "Patient A"
- [ ] Patients tab shows "Patient A — 2 visits"
- [ ] Click Patient A → both notes listed in date order
- [ ] Click "Compare last 2 visits" → comparison summary renders
- [ ] Summary correctly identifies what changed (medications, symptoms)

---

## 9. File Changes Per Phase

```
Phase 1 — Voice Input
├── api/main.py              ADD: /transcribe endpoint
├── api/requirements.txt     ADD: openai>=1.30.0
├── web/app/app/page.tsx     ADD: recording state, toggleRecording(), mic button
└── .env / .env.example      ADD: OPENAI_API_KEY

Phase 2 — ICD-10 Codes
├── api/schemas.py           ADD: icd10_code to Diagnosis
├── web/lib/types.ts         ADD: icd10_code to Diagnosis interface
├── web/app/app/page.tsx     ADD: ICD-10 input in DiagnosisList
└── web/lib/markdown.ts      UPDATE: include ICD-10 in assessment output

Phase 3 — PDF Export
├── api/pdf_export.py        NEW: soap_to_pdf() using reportlab
├── api/main.py              ADD: /export/pdf endpoint
├── api/requirements.txt     ADD: reportlab==4.2.2
└── web/app/app/page.tsx     ADD: downloadPdf(), Download PDF button

Phase 4 — Auth + Isolation
├── web/app/api/auth/[...nextauth]/route.ts   NEW: NextAuth magic link config
├── web/app/app/page.tsx     ADD: session check, X-User-Id header on all fetches
├── api/main.py              ADD: get_user_id dependency on all Qdrant endpoints
├── api/vector_store.py      ADD: user_id to save payload; _user_filter on all queries
└── .env.local               ADD: AUTH_SECRET, AUTH_RESEND_KEY, NEXTAUTH_URL

Phase 5 — Patient Labels
├── api/schemas.py           ADD: patient_label to save path
├── api/main.py              ADD: /patients, /patients/{label}/notes, /compare
├── api/vector_store.py      ADD: patient_label in payload; list_patients()
└── web/app/app/page.tsx     ADD: Patients tab, compare button
```

---

## 10. Environment Variables — Full List After Milestone 2

```bash
# Existing (Milestone 1)
DEEPSEEK_API_KEY=sk-...
QDRANT_URL=https://your-cluster.qdrant.io
QDRANT_API_KEY=your-qdrant-api-key
QDRANT_COLLECTION=soap_notes

# New — Phase 1
OPENAI_API_KEY=sk-...        # Whisper only (~$0.006/min)

# New — Phase 4 (frontend .env.local)
AUTH_SECRET=<32-char random string>
AUTH_RESEND_KEY=re_...       # Resend free tier
NEXTAUTH_URL=http://localhost:3000
```

---

## 11. Validation Gates — Don't Move Past These

| After Phase | Gate |
|---|---|
| Phase 1 | Speak 20s dictation → full SOAP note generated in under 25 seconds total |
| Phase 2 | MDD + GAD note shows F33.1 and F41.1 in Assessment |
| Phase 3 | Downloaded PDF opens in any PDF reader, all sections present |
| Phase 4 | Two different email accounts cannot see each other's notes |
| Phase 5 | Two visits for same patient → comparison summary correctly names a medication change |

---

## 12. What NOT to Build in Milestone 2

| Feature | Why to skip |
|---|---|
| EHR integration (Epic, Athena API) | 6-month sales cycle, requires compliance partnership |
| Real-time audio streaming | Whisper batch is fast enough; streaming adds WebSocket infra |
| Custom note templates | No clinician has asked for this yet |
| Mobile app | Desktop browser covers clinical workflow for now |
| Hybrid BM25 + vector search | Pure semantic search is sufficient at <100 notes per user |
| Hindsight SDK | Phase 5 comparison achieves the same result without new SaaS dependency |
| RAGAS CI evaluation | Build this after 5 customers, not before |

---

## 13. Compliance Triggers — Watch For These

| Trigger | Action required |
|---|---|
| First real patient note enters the system | Swap DeepSeek → Azure OpenAI (BAA-eligible) |
| First paying customer | Sign single-page terms; start Vanta evidence collection |
| Customer asks "is this HIPAA compliant?" | Stop, do not say yes, start BAA process |
| 5+ customers | SOC 2 Type I preparation |

Do not start HIPAA paperwork speculatively. It is expensive and time-consuming.
Start it only when a customer explicitly requires it or when real PHI enters the system.

---

## 14. Rules Carried Forward From Milestone 1

1. **Never send real PHI to DeepSeek** — they cannot sign a HIPAA BAA.
2. **Never add web search fallback to CRAG** — medical answers must be
   grounded in stored clinical records only.
3. **`api/structure.py` and `api/ingest.py` are untouched** — all new
   features go in new files or new endpoints in `main.py`.
4. **`api/schemas.py` and `web/lib/types.ts` must stay in lockstep** —
   update both whenever a schema field changes.
5. **Do not commit** `soap-note-*.json`, uvicorn logs, screenshots,
   `note.md`, or `Dataset/`.
6. **MTSamples data hygiene** — strip web navigation artifacts before
   structuring. Clinical text only.
7. **New in Milestone 2:** `user_id` filter must be on every Qdrant query —
   no exceptions. A missing filter is a data leak between customers.

---

## 15. Build Sequence

```
Week 1:  Phase 1 (Voice) + Phase 2 (ICD-10)   ← demo-ready features
Week 2:  Phase 3 (PDF)                         ← complete the output story
Week 3:  Demo calls with clinicians             ← validate before building auth
Week 4:  Phase 4 (Auth + isolation)            ← required before charging
Week 5:  Phase 5 (Patient labels)              ← stickiness feature
Week 6:  First paid customer target
```

Do not build auth before demo calls. You might learn the product needs to
change. Phases 1–3 are fully demoed without auth — use them to get to
Week 3 conversations with real psychiatrists.

---

## 16. One-Line Summary Per Phase

- **Phase 1**: Clinician speaks → text appears → SOAP renders. No typing needed.
- **Phase 2**: Every diagnosis has its billing code. Clinician can edit before signing.
- **Phase 3**: One PDF button. Output the clinician can put in their EHR.
- **Phase 4**: Each clinician's notes are theirs alone. Safe to charge money.
- **Phase 5**: Patient history accumulates across visits. Clinicians cannot leave.
