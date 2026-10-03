from enum import Enum

from pydantic import BaseModel, Field

from api.usage import QuotaState


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
        description="ICD-10-CM code for this diagnosis. Coding a diagnosis the clinician stated is a "
                    "lookup, not a guess, so assign a code whenever the diagnosis names a codeable "
                    "condition: e.g. 'F33.1' recurrent MDD moderate, 'F41.1' GAD, 'F31.81' bipolar II, "
                    "'F43.10' PTSD, 'F90.2' ADHD combined type, 'F42.2' OCD, 'F40.10' social anxiety "
                    "disorder, 'F10.20' alcohol use disorder moderate, 'G47.00' insomnia. If severity, "
                    "episode, or remission status was not stated, use the unspecified member of the same "
                    "family ('F33.9' for recurrent MDD of unstated severity, 'F31.9' for bipolar of "
                    "unstated type) instead of leaving this empty. Use None only when the stated problem "
                    "is too non-specific to map to any code at all, such as 'mood symptoms' or "
                    "'possible personality issues'."
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
    patient_label: str | None = Field(
        default=None,
        description="Restrict retrieval to one patient's notes. Omit to search "
                    "across every note the user owns.",
    )


class AskResponse(BaseModel):
    answer: str
    sources: list[NoteRecord]
    grounded: bool
    rewritten: bool
    # Echoes the scope actually used, so the UI can show what was searched.
    patient_label: str | None = None


class StructureResponse(BaseModel):
    note: SOAPNote
    note_id: str
    # Quota snapshot after this note was charged, so the UI can update its
    # meter without a second round trip.
    usage: QuotaState | None = None


class PatientRecord(BaseModel):
    patient_label: str
    note_count: int
    last_visit: str


class PatientLabelRequest(BaseModel):
    patient_label: str


class CompareRequest(BaseModel):
    note_a: SOAPNote
    note_b: SOAPNote
    label_a: str | None = None
    label_b: str | None = None


class CompareResponse(BaseModel):
    summary: str
