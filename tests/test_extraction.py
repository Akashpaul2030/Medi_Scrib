import json
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
