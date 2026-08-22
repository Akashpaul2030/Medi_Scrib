import os
import uuid
from datetime import datetime, timezone

from dotenv import load_dotenv
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    MatchValue,
    PayloadSchemaType,
    VectorParams,
)

from api.schemas import SOAPNote

load_dotenv()

_URL = os.environ["QDRANT_URL"]
_API_KEY = os.environ["QDRANT_API_KEY"]
_COLLECTION = os.getenv("QDRANT_COLLECTION", "soap_notes")

_EMBED_MODEL = "BAAI/bge-small-en-v1.5"
_DIMS = 384
# FastEmbed's internal vector name for BAAI/bge-small-en-v1.5; must match what
# _client.add() / _client.query() use when set_model() is active.
_VECTOR_NAME = "fast-bge-small-en-v1.5"

_client = QdrantClient(url=_URL, api_key=_API_KEY, check_compatibility=False)
_client.set_model(_EMBED_MODEL)


def ensure_collection() -> None:
    existing = {c.name for c in _client.get_collections().collections}
    if _COLLECTION in existing:
        info = _client.get_collection(_COLLECTION)
        # If the collection was created with an unnamed default vector (VectorParams,
        # not a dict), it is incompatible with FastEmbed's named-vector API — delete
        # and recreate.
        if not isinstance(info.config.params.vectors, dict):
            _client.delete_collection(_COLLECTION)
            existing.discard(_COLLECTION)
    if _COLLECTION not in existing:
        _client.create_collection(
            collection_name=_COLLECTION,
            vectors_config={_VECTOR_NAME: VectorParams(size=_DIMS, distance=Distance.COSINE)},
        )
    _client.create_payload_index(
        collection_name=_COLLECTION,
        field_name="user_id",
        field_schema=PayloadSchemaType.KEYWORD,
    )
    _client.create_payload_index(
        collection_name=_COLLECTION,
        field_name="patient_label",
        field_schema=PayloadSchemaType.KEYWORD,
    )


def _user_filter(user_id: str) -> Filter:
    return Filter(must=[FieldCondition(key="user_id", match=MatchValue(value=user_id))])


def save_note(
    note: SOAPNote,
    raw_text: str,
    user_id: str = "anonymous",
    note_id: str | None = None,
    patient_label: str | None = None,
) -> str:
    if note_id is None:
        note_id = str(uuid.uuid4())
    embed_text = (
        note.chief_complaint
        + " "
        + note.subjective
        + " "
        + " ".join(d.description for d in note.assessment)
        + " "
        + note.plan
    )

    _client.add(
        collection_name=_COLLECTION,
        documents=[embed_text],
        metadata=[
            {
                "user_id": user_id,
                "note_id": note_id,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "raw_text_length": len(raw_text),
                "chief_complaint": note.chief_complaint,
                "subjective": note.subjective,
                "objective": note.objective,
                "assessment": [
                    {"description": d.description, "icd10_code": d.icd10_code, "status": d.status.value}
                    for d in note.assessment
                ],
                "plan": note.plan,
                "medications_prescribed": [
                    {
                        "name": m.name,
                        "dose": m.dose,
                        "route": m.route,
                        "frequency": m.frequency,
                    }
                    for m in note.medications_prescribed
                ],
                "follow_up": note.follow_up,
                "flags_for_review": note.flags_for_review,
                "patient_label": patient_label,
            }
        ],
        ids=[note_id],
    )
    return note_id


def search_notes(query: str, user_id: str = "anonymous", limit: int = 5,
                 patient_label: str | None = None) -> list[dict]:
    """Semantic search over a user's notes, optionally narrowed to one patient.

    The patient filter is applied in Qdrant rather than after retrieval, so a
    scoped question can never surface another patient's note in the first
    place — filtering afterwards would still have spent the slots.
    """
    conditions = [FieldCondition(key="user_id", match=MatchValue(value=user_id))]
    if patient_label:
        conditions.append(
            FieldCondition(key="patient_label", match=MatchValue(value=patient_label))
        )

    hits = _client.query(
        collection_name=_COLLECTION,
        query_text=query,
        query_filter=Filter(must=conditions),
        limit=limit,
    )
    results = []
    for hit in hits:
        payload = dict(hit.metadata)
        payload["_score"] = hit.score
        results.append(payload)
    return results


def list_notes(user_id: str = "anonymous", limit: int = 20) -> list[dict]:
    records, _ = _client.scroll(
        collection_name=_COLLECTION,
        scroll_filter=_user_filter(user_id),
        limit=limit,
        with_payload=True,
        with_vectors=False,
    )
    payloads = [dict(r.payload) for r in records]
    payloads.sort(key=lambda p: p.get("created_at", ""), reverse=True)
    return payloads


def retrieve_note(note_id: str, user_id: str = "anonymous") -> dict | None:
    results = _client.retrieve(
        collection_name=_COLLECTION,
        ids=[note_id],
        with_payload=True,
        with_vectors=False,
    )
    if not results:
        return None
    payload = dict(results[0].payload)
    if payload.get("user_id", "anonymous") != user_id:
        return None
    return payload


def set_patient_label(note_id: str, patient_label: str, user_id: str = "anonymous") -> bool:
    results = _client.retrieve(
        collection_name=_COLLECTION,
        ids=[note_id],
        with_payload=True,
        with_vectors=False,
    )
    if not results:
        return False
    if results[0].payload.get("user_id") != user_id:
        return False
    _client.set_payload(
        collection_name=_COLLECTION,
        payload={"patient_label": patient_label},
        points=[note_id],
    )
    return True


def list_patients(user_id: str = "anonymous") -> list[dict]:
    records, _ = _client.scroll(
        collection_name=_COLLECTION,
        scroll_filter=_user_filter(user_id),
        limit=1000,
        with_payload=True,
        with_vectors=False,
    )
    patients: dict[str, dict] = {}
    for r in records:
        label = r.payload.get("patient_label")
        if not label:
            continue
        if label not in patients:
            patients[label] = {"note_count": 0, "last_visit": ""}
        patients[label]["note_count"] += 1
        created = r.payload.get("created_at", "")
        if created > patients[label]["last_visit"]:
            patients[label]["last_visit"] = created
    return sorted(
        [{"patient_label": k, **v} for k, v in patients.items()],
        key=lambda x: x["last_visit"],
        reverse=True,
    )


def list_patient_notes(patient_label: str, user_id: str = "anonymous") -> list[dict]:
    records, _ = _client.scroll(
        collection_name=_COLLECTION,
        scroll_filter=Filter(must=[
            FieldCondition(key="user_id", match=MatchValue(value=user_id)),
            FieldCondition(key="patient_label", match=MatchValue(value=patient_label)),
        ]),
        limit=50,
        with_payload=True,
        with_vectors=False,
    )
    payloads = [dict(r.payload) for r in records]
    payloads.sort(key=lambda p: p.get("created_at", ""), reverse=True)
    return payloads
