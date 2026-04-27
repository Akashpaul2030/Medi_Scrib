from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions
from docling.document_converter import DocumentConverter, PdfFormatOption
from loguru import logger


@dataclass
class ParsedDoc:
    markdown: str
    page_count: int
    source_format: str


@lru_cache(maxsize=1)
def _converter() -> DocumentConverter:
    pdf_opts = PdfPipelineOptions(do_ocr=False)
    return DocumentConverter(
        format_options={
            InputFormat.PDF: PdfFormatOption(pipeline_options=pdf_opts),
        }
    )


def parse_to_markdown(path: Path) -> ParsedDoc:
    logger.info(f"Parsing {path.name} ({path.stat().st_size} bytes)")
    result = _converter().convert(str(path))
    doc = result.document
    md = doc.export_to_markdown()
    pages = len(getattr(doc, "pages", {}) or {}) or 1
    fmt = path.suffix.lstrip(".").lower() or "unknown"
    logger.info(f"Parsed {path.name}: {pages} page(s), {len(md)} chars markdown")
    return ParsedDoc(markdown=md, page_count=pages, source_format=fmt)
