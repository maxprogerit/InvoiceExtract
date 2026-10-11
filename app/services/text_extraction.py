from __future__ import annotations

import io
import logging
from dataclasses import dataclass

import fitz  # PyMuPDF
from PIL import Image, ImageOps, UnidentifiedImageError

from app.core.errors import UnreadableDocumentError
from app.services.file_validation import PDF
from app.services.ocr import ocr_image

logger = logging.getLogger(__name__)

TEXT_LAYER = "text_layer"
OCR = "ocr"

# A page with fewer non-whitespace characters than this is treated as "no text layer"
# (scanned pages often carry a few stray characters from watermarks or scanner software).
MIN_PAGE_CHARS = 20
# Whole-document floor: even after OCR we need at least this much text to bother the LLM.
MIN_DOCUMENT_CHARS = 20

OCR_DPI = 300
# Decompression-bomb guard: refuse to rasterise / decode anything above this many pixels.
MAX_PIXELS = 40_000_000


@dataclass(frozen=True)
class ExtractionResult:
    text: str
    method: str  # TEXT_LAYER | OCR
    page_count: int


def _non_ws_len(text: str) -> int:
    return sum(1 for ch in text if not ch.isspace())


def _render_page(page: "fitz.Page") -> Image.Image:
    # Lower the DPI for unusually large pages so the bitmap stays under MAX_PIXELS.
    width_in, height_in = page.rect.width / 72, page.rect.height / 72
    dpi = OCR_DPI
    if width_in * height_in * dpi * dpi > MAX_PIXELS:
        dpi = int((MAX_PIXELS / (width_in * height_in)) ** 0.5)
        if dpi < 72:
            raise UnreadableDocumentError("PDF page is too large to process")
    pix = page.get_pixmap(dpi=dpi, colorspace=fitz.csGRAY)
    return Image.frombytes("L", (pix.width, pix.height), pix.samples)


def _extract_pdf(data: bytes, languages: str) -> ExtractionResult:
    try:
        doc = fitz.open(stream=data, filetype="pdf")
    except Exception as exc:
        raise UnreadableDocumentError("The PDF is corrupt or cannot be opened") from exc

    page_texts = []
    used_ocr = False
    with doc:
        for index, page in enumerate(doc):
            text = page.get_text()
            if _non_ws_len(text) < MIN_PAGE_CHARS:
                logger.info("page has no text layer, running OCR", extra={"page": index + 1})
                text = ocr_image(_render_page(page), languages)
                used_ocr = True
            page_texts.append(text.strip())
        page_count = doc.page_count

    return ExtractionResult(
        text="\n\n".join(t for t in page_texts if t),
        method=OCR if used_ocr else TEXT_LAYER,
        page_count=page_count,
    )


def _extract_image(data: bytes, languages: str) -> ExtractionResult:
    try:
        image = Image.open(io.BytesIO(data))
        if image.width * image.height > MAX_PIXELS:
            raise UnreadableDocumentError("Image resolution is too large to process")
        image.load()
    except UnreadableDocumentError:
        raise
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise UnreadableDocumentError("The image is corrupt or cannot be decoded") from exc

    # Apply EXIF rotation (phone photos), flatten alpha onto white, go grayscale for Tesseract.
    image = ImageOps.exif_transpose(image)
    if image.mode in ("RGBA", "LA", "P"):
        rgba = image.convert("RGBA")
        background = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
        image = Image.alpha_composite(background, rgba)
    image = image.convert("L")

    return ExtractionResult(text=ocr_image(image, languages).strip(), method=OCR, page_count=1)


def extract_text(data: bytes, file_type: str, *, ocr_languages: str) -> ExtractionResult:
    """Extract text from an already type-validated upload.

    PDFs use the embedded text layer per page and fall back to OCR for pages without one;
    images always go through OCR. `method` reports 'ocr' if OCR was used for any page.
    """
    result = _extract_pdf(data, ocr_languages) if file_type == PDF else _extract_image(data, ocr_languages)
    if _non_ws_len(result.text) < MIN_DOCUMENT_CHARS:
        raise UnreadableDocumentError("No readable text found in the document")
    return result
