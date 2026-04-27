import os

import instructor
from dotenv import load_dotenv
from loguru import logger
from openai import OpenAI
from tenacity import retry, stop_after_attempt, wait_exponential

from api.schemas import SOAPNote

load_dotenv()

_client = instructor.from_openai(
    OpenAI(
        api_key=os.getenv("DEEPSEEK_API_KEY"),
        base_url="https://api.deepseek.com",
    ),
    mode=instructor.Mode.JSON,
)

SYSTEM_PROMPT = """You are a clinical documentation assistant for outpatient psychiatry.
Convert the clinician's free-text dictation into a structured SOAP note as a single JSON object matching the provided schema.

Strict rules:
- Use ONLY information explicitly stated in the dictation.
- Never invent values, diagnoses, vitals, doses, routes, or frequencies.
- If a field is ambiguous, missing, or could be interpreted multiple ways, choose the most conservative reading and add a short note to flags_for_review describing what to verify.
- Preserve the clinician's phrasing where possible; do not editorialize.
- Capture every medication mentioned as continued, started, or titrated in medications_prescribed, with dose / route / frequency exactly as stated.
- Every diagnosis or differential discussed goes in assessment with a status: active, resolved, or ruled_out. Rule-outs must be included explicitly with status='ruled_out'.
- Suicidal ideation, homicidal ideation, passive death wishes, or psychotic symptoms — if present or denied — should be reflected in subjective, and any nuance (e.g. passive vs active SI) should be flagged for review."""


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=8), reraise=True)
def to_soap(text: str) -> SOAPNote:
    logger.info(f"Structuring dictation ({len(text)} chars)")
    note = _client.chat.completions.create(
        model="deepseek-chat",
        response_model=SOAPNote,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": text},
        ],
        temperature=0,
    )
    logger.info(
        f"Returned SOAP: {len(note.medications_prescribed)} meds, "
        f"{len(note.assessment)} dx, {len(note.flags_for_review)} flags"
    )
    return note
