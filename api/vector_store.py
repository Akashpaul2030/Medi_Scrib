import os
import uuid
from datetime import datetime, timezone

from dotenv import load_dotenv
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams

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


def save_note(note: SOAPNote, raw_text: str) -> str:
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
                "note_id": note_id,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "raw_text_length": len(raw_text),
                "chief_complaint": note.chief_complaint,
                "subjective": note.subjective,
                "objective": note.objective,
                "assessment": [
                    {"description": d.description, "status": d.status.value}
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
            }
        ],
        ids=[note_id],
    )
    return note_id


def search_notes(query: str, limit: int = 5) -> list[dict]:
    hits = _client.query(
        collection_name=_COLLECTION,
        query_text=query,
        limit=limit,
    )
    results = []
    for hit in hits:
        payload = dict(hit.metadata)
        payload["_score"] = hit.score
        results.append(payload)
    return results


def list_notes(limit: int = 20) -> list[dict]:
    records, _ = _client.scroll(
        collection_name=_COLLECTION,
        limit=limit,
        with_payload=True,
        with_vectors=False,
    )
    payloads = [dict(r.payload) for r in records]
    payloads.sort(key=lambda p: p.get("created_at", ""), reverse=True)
    return payloads


def retrieve_note(note_id: str) -> dict | None:
    results = _client.retrieve(
        collection_name=_COLLECTION,
        ids=[note_id],
        with_payload=True,
        with_vectors=False,
    )
    if not results:
        return None
    return dict(results[0].payload)
