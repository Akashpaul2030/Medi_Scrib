from enum import Enum

from pydantic import BaseModel, Field


class DiagnosisStatus(str, Enum):
    active = "active"
    resolved = "resolved"
    ruled_out = "ruled_out"


class Diagnosis(BaseModel):
    description: str = Field(
        description="Diagnosis or problem stated by the clinician, e.g. 'Recurrent major depressive disorder'. Use clinical phrasing from the dictation; do not invent diagnoses."
    )
    icd10_code: str | None = Field(
        default=None,
        description="ICD-10-CM code for this diagnosis if clearly identifiable from the description, "
                    "e.g. 'F33.1' for recurrent MDD moderate, 'F41.1' for GAD, 'F31.81' for bipolar II, "
                    "'F43.10' for PTSD, 'F90.2' for ADHD combined. Use None if the diagnosis is too vague "
                    "to code confidently — do not guess."
    )
    status: DiagnosisStatus = Field(
        description="One of 'active' (currently being treated), 'resolved' (no longer present), or 'ruled_out' (considered and excluded). If unclear, default to 'active' and add an entry to flags_for_review."
    )


class Medication(BaseModel):
    name: str = Field(
        description="Generic medication name as stated, e.g. 'sertraline', 'lamotrigine', 'bupropion XL'. Do not add brand names that were not stated."
    )
    dose: str = Field(
        description="Numeric dose with units exactly as stated, e.g. '100 mg', '40 mg'. If the dose is not stated, write 'unspecified' and flag it."
    )
    route: str = Field(
        description="Route of administration, e.g. 'PO', 'IM', 'SL'. Default to 'PO' only if the route is clearly oral by context (oral tablet, capsule); otherwise write 'unspecified' and flag it."
    )
    frequency: str = Field(
        description="Dosing frequency exactly as stated, e.g. 'daily', 'BID', 'every 6 hours as needed', 'at bedtime'. Preserve PRN qualifiers."
    )


class SOAPNote(BaseModel):
    chief_complaint: str = Field(
        description="One short phrase capturing the reason for the visit, e.g. 'Follow-up for depression and anxiety' or 'New patient evaluation for attention difficulties'."
    )
    subjective: str = Field(
        description="Patient-reported history: symptoms, course, response to current treatment, relevant negatives. Use the clinician's phrasing; do not paraphrase loosely."
    )
    objective: str = Field(
        description="Observed findings: mental status exam, vitals if stated, behavioral observations. Only include what was explicitly stated."
    )
    assessment: list[Diagnosis] = Field(
        description="List of diagnoses or differentials discussed. Each must have a description and a status (active/resolved/ruled_out). Include rule-outs explicitly with status='ruled_out'."
    )
    plan: str = Field(
        description="Clinical plan: medication changes, labs ordered, referrals, therapy, safety plan, patient education. Be specific."
    )
    medications_prescribed: list[Medication] = Field(
        description="Every medication mentioned as continued, started, or titrated. Capture name, dose, route, frequency. Do not include medications the patient is no longer taking unless explicitly continued."
    )
    follow_up: str | None = Field(
        description="Follow-up interval as stated, e.g. '2 weeks', '6 weeks'. Null if not stated."
    )
    flags_for_review: list[str] = Field(
        description="Anything ambiguous, missing, or potentially concerning that the clinician should verify before signing — missing doses, unclear medication routes, suicidal ideation nuance, conflicting statements. Be conservative: when in doubt, flag it."
    )


class SearchRequest(BaseModel):
    query: str = Field(min_length=1)
    limit: int = Field(default=5, ge=1, le=20)


class NoteRecord(BaseModel):
    note_id: str
    created_at: str
    chief_complaint: str
    score: float | None = None


class SearchResponse(BaseModel):
    results: list[NoteRecord]
    total: int


class NoteDetail(BaseModel):
    note_id: str
    created_at: str
    raw_text_length: int
    note: SOAPNote


class AskRequest(BaseModel):
    question: str = Field(min_length=1)


class AskResponse(BaseModel):
    answer: str
    sources: list[NoteRecord]
    grounded: bool
    rewritten: bool
