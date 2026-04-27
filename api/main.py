import tempfile
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger
from pydantic import BaseModel, Field

from api.ingest import parse_to_markdown
from api.schemas import SOAPNote
from api.structure import to_soap

MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20 MB
ALLOWED_SUFFIXES = {".pdf", ".docx", ".pptx", ".html", ".htm", ".md", ".txt"}

app = FastAPI(title="ScribeAI", version="0.1.0")

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
def structure(req: StructureRequest) -> SOAPNote:
    try:
        return to_soap(req.text)
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
