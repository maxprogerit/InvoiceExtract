from __future__ import annotations

import logging
import shutil
from typing import Optional

import pytesseract
from PIL import Image
from pytesseract import TesseractError, TesseractNotFoundError

from app.core.errors import OcrUnavailableError, UnreadableDocumentError

logger = logging.getLogger(__name__)

# Hard cap per image so one pathological scan cannot pin a worker forever.
OCR_TIMEOUT_SECONDS = 60


def configure_tesseract(cmd: Optional[str]) -> None:
    """Point pytesseract at a specific binary (needed when tesseract is not on PATH)."""
    if cmd:
        pytesseract.pytesseract.tesseract_cmd = cmd


def tesseract_available() -> bool:
    configured = pytesseract.pytesseract.tesseract_cmd
    return shutil.which(configured) is not None


def ocr_image(image: Image.Image, languages: str) -> str:
    """Run Tesseract on one PIL image and return the recognised text."""
    try:
        # Default page segmentation (auto layout). Real invoices are often multi-column
        # (sender block next to invoice metadata), which forced single-block modes handle worse.
        return pytesseract.image_to_string(image, lang=languages, timeout=OCR_TIMEOUT_SECONDS)
    except TesseractNotFoundError as exc:
        raise OcrUnavailableError("OCR engine (Tesseract) is not installed on the server") from exc
    except TesseractError as exc:
        # Most common cause: a requested language pack is not installed.
        logger.error("tesseract failed", extra={"languages": languages, "detail": str(exc)[:300]})
        raise OcrUnavailableError(
            "OCR failed; check that the configured OCR_LANGUAGES are installed"
        ) from exc
    except RuntimeError as exc:  # pytesseract raises RuntimeError on timeout
        raise UnreadableDocumentError("OCR timed out; the image may be too complex or too large") from exc
