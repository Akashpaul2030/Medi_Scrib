import os
import tempfile
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

import assemblyai as aai
from fastapi import BackgroundTasks, Depends, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from loguru import logger
from pydantic import BaseModel, Field, ValidationError

from api.ingest import parse_to_markdown
from api.pdf_export import soap_to_pdf
from api.rag_graph import run_ask, run_compare
from api.schemas import (
    AskRequest, AskResponse, CompareRequest, CompareResponse,
    NoteDetail, NoteRecord, PatientLabelRequest, PatientRecord,
    SOAPNote, SearchRequest, SearchResponse, StructureResponse,
)
from api.structure import to_soap
from api.vector_store import (
    ensure_collection, list_notes, list_patient_notes, list_patients,
    retrieve_note, save_note, search_notes, set_patient_label,
)

def get_user_id(x_user_id: str = Header("anonymous", alias="X-User-Id")) -> str:
    return x_user_id or "anonymous"


MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20 MB
ALLOWED_SUFFIXES = {".pdf", ".docx", ".pptx", ".html", ".htm", ".md", ".txt"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_collection()
    yield


app = FastAPI(title="ScribeAI", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class StructureRequest(BaseModel):
    text: str = Field(min_length=1)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/structure", response_model=StructureResponse)
def structure(req: StructureRequest, background_tasks: BackgroundTasks,
              user_id: str = Depends(get_user_id)) -> StructureResponse:
    try:
        note = to_soap(req.text)
        note_id = str(uuid.uuid4())
        background_tasks.add_task(save_note, note, req.text, user_id, note_id)
        return StructureResponse(note=note, note_id=note_id)
    except Exception as e:
        logger.exception("Structuring failed")
        raise HTTPException(status_code=502, detail=f"Structuring failed: {e}")


class IngestResponse(BaseModel):
    text: str
    page_count: int
    source_format: str
    char_count: int


@app.post("/ingest", response_model=IngestResponse)
async def ingest(file: UploadFile = File(...)) -> IngestResponse:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type {suffix or '(none)'}. Allowed: {sorted(ALLOWED_SUFFIXES)}",
        )

    blob = await file.read()
    if len(blob) == 0:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(blob) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({len(blob)} bytes). Limit is {MAX_UPLOAD_BYTES}.",
        )

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(blob)
        tmp_path = Path(tmp.name)

    try:
        parsed = parse_to_markdown(tmp_path)
    except Exception as e:
        logger.exception("Ingest failed")
        raise HTTPException(status_code=502, detail=f"Parse failed: {e}")
    finally:
        tmp_path.unlink(missing_ok=True)

    return IngestResponse(
        text=parsed.markdown,
        page_count=parsed.page_count,
        source_format=parsed.source_format,
        char_count=len(parsed.markdown),
    )


MAX_AUDIO_BYTES = 25 * 1024 * 1024  # 25 MB
ALLOWED_AUDIO_SUFFIXES = {".webm", ".mp4", ".mp3", ".wav", ".m4a", ".ogg"}


@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(...)) -> dict[str, str]:
    aai.settings.api_key = os.getenv("ASSEMBLYAI_API_KEY", "")
    if not aai.settings.api_key:
        raise HTTPException(status_code=500, detail="ASSEMBLYAI_API_KEY not set")

    blob = await audio.read()
    if len(blob) == 0:
        raise HTTPException(status_code=400, detail="Empty audio file")
    if len(blob) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Audio too large (limit 25 MB)")

    suffix = Path(audio.filename or "audio.webm").suffix.lower() or ".webm"
    if suffix not in ALLOWED_AUDIO_SUFFIXES:
        suffix = ".webm"

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(blob)
        tmp_path = Path(tmp.name)

    config = aai.TranscriptionConfig(
        speech_models=["universal-3-pro", "universal-2"],
        language_detection=True,  # safe for real speech; AssemblyAI errors on silent audio
    )
    try:
        transcript = aai.Transcriber().transcribe(str(tmp_path), config)
        if transcript.status == aai.TranscriptStatus.error:
            raise HTTPException(status_code=502, detail=f"Transcription error: {transcript.error}")
        return {"text": transcript.text or ""}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Transcription failed")
        raise HTTPException(status_code=502, detail=f"Transcription failed: {e}")
    finally:
        tmp_path.unlink(missing_ok=True)


@app.post("/search", response_model=SearchResponse)
def search(req: SearchRequest, user_id: str = Depends(get_user_id)) -> SearchResponse:
    try:
        hits = search_notes(req.query, user_id=user_id, limit=req.limit)
        records = [
            NoteRecord(
                note_id=h["note_id"],
                created_at=h["created_at"],
                chief_complaint=h["chief_complaint"],
                score=h.get("_score"),
            )
            for h in hits
        ]
        return SearchResponse(results=records, total=len(records))
    except Exception as e:
        logger.exception("Search failed")
        raise HTTPException(status_code=502, detail=f"Search failed: {e}")


@app.get("/notes", response_model=SearchResponse)
def notes(user_id: str = Depends(get_user_id)) -> SearchResponse:
    try:
        items = list_notes(user_id=user_id, limit=20)
        records = [
            NoteRecord(
                note_id=i["note_id"],
                created_at=i["created_at"],
                chief_complaint=i["chief_complaint"],
            )
            for i in items
        ]
        return SearchResponse(results=records, total=len(records))
    except Exception as e:
        logger.exception("Notes list failed")
        raise HTTPException(status_code=502, detail=f"Notes list failed: {e}")


@app.get("/notes/{note_id}", response_model=NoteDetail)
def get_note(note_id: str, user_id: str = Depends(get_user_id)) -> NoteDetail:
    try:
        payload = retrieve_note(note_id, user_id=user_id)
        if payload is None:
            raise HTTPException(status_code=404, detail="Note not found")
        return NoteDetail(
            note_id=payload["note_id"],
            created_at=payload["created_at"],
            raw_text_length=payload["raw_text_length"],
            note=SOAPNote.model_validate({
                k: payload[k] for k in SOAPNote.model_fields
                if k in payload
            }),
        )
    except ValidationError as e:
        logger.error("Stored payload failed validation: {}", e)
        raise HTTPException(status_code=502, detail="Stored note payload is malformed")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Note retrieval failed")
        raise HTTPException(status_code=502, detail=f"Retrieval failed: {e}")


@app.post("/ask", response_model=AskResponse)
def ask(req: AskRequest, user_id: str = Depends(get_user_id)) -> AskResponse:
    try:
        result = run_ask(req.question, user_id=user_id)
        sources = [
            NoteRecord(
                note_id=s["note_id"],
                created_at=s["created_at"],
                chief_complaint=s["chief_complaint"],
            )
            for s in result.get("sources", [])
        ]
        return AskResponse(
            answer=result.get("generation") or "No answer generated.",
            sources=sources,
            grounded=result.get("grounded", False),
            rewritten=result.get("rewrite_count", 0) > 0,
        )
    except Exception as e:
        logger.exception("Ask failed")
        raise HTTPException(status_code=502, detail=f"Ask failed: {e}")


@app.patch("/notes/{note_id}/label")
def label_note(note_id: str, req: PatientLabelRequest,
               user_id: str = Depends(get_user_id)) -> dict:
    try:
        ok = set_patient_label(note_id, req.patient_label, user_id=user_id)
        if not ok:
            raise HTTPException(status_code=404, detail="Note not found")
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Label update failed")
        raise HTTPException(status_code=502, detail=f"Label update failed: {e}")


@app.get("/patients")
def get_patients(user_id: str = Depends(get_user_id)) -> dict:
    try:
        items = list_patients(user_id=user_id)
        records = [PatientRecord(**item) for item in items]
        return {"patients": records, "total": len(records)}
    except Exception as e:
        logger.exception("Patients list failed")
        raise HTTPException(status_code=502, detail=f"Patients list failed: {e}")


@app.get("/patients/{label}/notes", response_model=SearchResponse)
def get_patient_notes(label: str, user_id: str = Depends(get_user_id)) -> SearchResponse:
    try:
        items = list_patient_notes(label, user_id=user_id)
        records = [
            NoteRecord(
                note_id=i["note_id"],
                created_at=i["created_at"],
                chief_complaint=i["chief_complaint"],
            )
            for i in items
        ]
        return SearchResponse(results=records, total=len(records))
    except Exception as e:
        logger.exception("Patient notes failed")
        raise HTTPException(status_code=502, detail=f"Patient notes failed: {e}")


@app.post("/compare", response_model=CompareResponse)
def compare(req: CompareRequest, user_id: str = Depends(get_user_id)) -> CompareResponse:
    try:
        summary = run_compare(
            req.note_a.model_dump(),
            req.note_b.model_dump(),
            req.label_a,
            req.label_b,
        )
        return CompareResponse(summary=summary)
    except Exception as e:
        logger.exception("Compare failed")
        raise HTTPException(status_code=502, detail=f"Compare failed: {e}")


class PdfExportRequest(BaseModel):
    note: SOAPNote
    created_at: str | None = None


@app.post("/export/pdf")
def export_pdf(req: PdfExportRequest) -> Response:
    try:
        pdf_bytes = soap_to_pdf(req.note, req.created_at)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=soap-note.pdf"},
        )
    except Exception as e:
        logger.exception("PDF export failed")
        raise HTTPException(status_code=502, detail=f"PDF export failed: {e}")
