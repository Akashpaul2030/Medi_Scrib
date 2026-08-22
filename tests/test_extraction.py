import json
import re
import os
import pathlib
import sys

import pytest
from dotenv import load_dotenv

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / ".env")

if not os.getenv("DEEPSEEK_API_KEY"):
    pytest.skip("DEEPSEEK_API_KEY not set", allow_module_level=True)

from api.structure import to_soap

SYNTHETIC = ROOT / "synthetic"
CASES = ["case_001", "case_002", "case_003"]


@pytest.fixture(scope="session", params=CASES)
def case(request):
    case_id = request.param
    text = (SYNTHETIC / f"{case_id}.txt").read_text(encoding="utf-8")
    expected = json.loads((SYNTHETIC / f"{case_id}.expected.json").read_text(encoding="utf-8"))
    actual = to_soap(text).model_dump()
    return case_id, expected, actual


def _has_token_match(target: str, candidates: list[str]) -> bool:
    target = target.lower()
    blob = " ".join(c.lower() for c in candidates)
    tokens = [t.strip(",.;:") for t in target.split() if len(t.strip(",.;:")) >= 5]
    if not tokens:
        return target in blob
    return any(t in blob for t in tokens)


def test_medications_match(case):
    case_id, expected, actual = case
    expected_names = [m["name"].lower() for m in expected["medications_prescribed"]]
    actual_names = [m["name"].lower() for m in actual["medications_prescribed"]]
    missing = [
        n for n in expected_names
        if not any(n in a or a in n for a in actual_names)
    ]
    assert not missing, f"{case_id}: missing meds {missing}; got {actual_names}"


def test_active_diagnoses_match(case):
    case_id, expected, actual = case
    expected_active = [d for d in expected["assessment"] if d["status"] == "active"]
    actual_descs = [d["description"] for d in actual["assessment"]]
    for dx in expected_active:
        assert _has_token_match(dx["description"], actual_descs), \
            f"{case_id}: no actual diagnosis matches '{dx['description']}'; got {actual_descs}"


def test_required_fields_present(case):
    case_id, _, actual = case
    for field in ["chief_complaint", "subjective", "objective", "plan"]:
        assert actual.get(field), f"{case_id}: empty required field '{field}'"


# ICD-10 families each case's active diagnoses must land in. Only the family is
# checked, not the full code: the model may legitimately pick F33.1 or F33.9
# depending on how much severity detail it reads into the dictation, and
# pinning the exact code would make this test fail on a correct answer.
EXPECTED_ICD10_PREFIXES = {
    "case_001": ["F33", "F41"],   # recurrent MDD, GAD
    "case_002": ["F31"],          # bipolar II
    "case_003": ["F90"],          # ADHD inattentive
}


def test_icd10_codes_assigned(case):
    """Every codeable active diagnosis gets a code.

    Regression guard: the system prompt used to say "use only what was stated",
    which the model read as forbidding ICD-10 codes entirely — a clinician
    never dictates "F33.1" — so this field came back null every time while the
    landing page advertised it.
    """
    case_id, _, actual = case
    active = [d for d in actual["assessment"] if d["status"] == "active"]
    uncoded = [d["description"] for d in active if not d.get("icd10_code")]
    assert not uncoded, f"{case_id}: active diagnoses with no ICD-10 code: {uncoded}"


def test_icd10_codes_are_plausible(case):
    """Codes land in the right chapter rather than being invented."""
    case_id, _, actual = case
    codes = [d["icd10_code"] for d in actual["assessment"]
             if d["status"] == "active" and d.get("icd10_code")]
    expected = EXPECTED_ICD10_PREFIXES[case_id]
    for prefix in expected:
        assert any(c.upper().startswith(prefix) for c in codes), \
            f"{case_id}: no code starting {prefix} among {codes}"
    for code in codes:
        assert re.fullmatch(r"[A-Z]\d{2}(\.[A-Z0-9]{1,4})?", code.upper()), \
            f"{case_id}: {code!r} is not a well-formed ICD-10-CM code"
