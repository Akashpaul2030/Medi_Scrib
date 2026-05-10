import tempfile
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger
from pydantic import BaseModel, Field, ValidationError

from api.ingest import parse_to_markdown
from api.rag_graph import run_ask
from api.schemas import AskRequest, AskResponse, NoteDetail, NoteRecord, SOAPNote, SearchRequest, SearchResponse
from api.structure import to_soap
from api.vector_store import ensure_collection, list_notes, retrieve_note, save_note, search_notes

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


@app.post("/structure", response_model=SOAPNote)
def structure(req: StructureRequest, background_tasks: BackgroundTasks) -> SOAPNote:
    try:
        note = to_soap(req.text)
        background_tasks.add_task(save_note, note, req.text)
        return note
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


@app.post("/search", response_model=SearchResponse)
def search(req: SearchRequest) -> SearchResponse:
    try:
        hits = search_notes(req.query, req.limit)
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
def notes() -> SearchResponse:
    try:
        items = list_notes(limit=20)
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
def get_note(note_id: str) -> NoteDetail:
    try:
        payload = retrieve_note(note_id)
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
def ask(req: AskRequest) -> AskResponse:
    try:
        result = run_ask(req.question)
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
