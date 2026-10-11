from __future__ import annotations

import os
import shutil
from pathlib import Path

# Settings are required at import time of app.main, so provide safe test values first.
# setdefault: a developer's real environment still wins if they set these deliberately.
os.environ.setdefault("API_KEY", "test-api-key")
os.environ.setdefault("DATABASE_URL", "sqlite://")  # replaced by fixtures that need a real DB

# Windows convenience: pick up the default Tesseract install location if it is not on PATH.
if shutil.which("tesseract") is None and not os.environ.get("TESSERACT_CMD"):
    _default = Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "Tesseract-OCR" / "tesseract.exe"
    for candidate in (_default, Path(r"C:\Program Files\Tesseract-OCR\tesseract.exe")):
        if candidate.exists():
            os.environ["TESSERACT_CMD"] = str(candidate)
            break

import pytest  # noqa: E402

from app.core.config import get_settings  # noqa: E402
from app.services.ocr import configure_tesseract, tesseract_available  # noqa: E402

SAMPLES = Path(__file__).parent / "samples"

configure_tesseract(get_settings().tesseract_cmd)

requires_tesseract = pytest.mark.skipif(
    not tesseract_available(), reason="Tesseract is not installed / not found"
)


@pytest.fixture
def sample_bytes():
    def _load(name: str) -> bytes:
        return (SAMPLES / name).read_bytes()

    return _load


# ---- API-level fixtures -----------------------------------------------------------------------

API_KEY = "test-api-key"
AUTH = {"X-API-Key": API_KEY}


@pytest.fixture
def db_engine():
    """In-memory SQLite by default; set TEST_DATABASE_URL to run the same tests on real PostgreSQL.

    Tables are created with metadata.create_all here (tests only). The app itself never does this:
    the schema comes from Alembic migrations.
    """
    from sqlalchemy import create_engine
    from sqlalchemy.pool import StaticPool

    import app.models  # noqa: F401
    from app.core.database import Base

    url = os.environ.get("TEST_DATABASE_URL")
    if url:
        engine = create_engine(url)
    else:
        engine = create_engine("sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False})
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield engine
    Base.metadata.drop_all(engine)
    engine.dispose()


class FakeExtractor:
    """Stands in for OpenAI: returns a canned invoice (or raises) and counts calls."""

    def __init__(self, invoice=None, error=None):
        from app.services.llm_extraction import LlmExtractionResult  # local: needs settings env

        self._result_cls = LlmExtractionResult
        self.invoice = invoice
        self.error = error
        self.calls = 0
        self.last_text = None

    def extract(self, text: str):
        self.calls += 1
        self.last_text = text
        if self.error:
            raise self.error
        return self._result_cls(
            invoice=self.invoice,
            model_name="fake-model",
            prompt_tokens=100,
            completion_tokens=50,
            latency_ms=1.0,
        )


@pytest.fixture
def fake_extractor():
    from tests.invoice_factory import make_invoice

    return FakeExtractor(invoice=make_invoice())


@pytest.fixture
def client(db_engine, fake_extractor):
    from fastapi.testclient import TestClient
    from sqlalchemy.orm import Session

    from app.api.invoices import get_invoice_extractor
    from app.core.database import get_db
    from app.main import app

    def override_get_db():
        with Session(db_engine, expire_on_commit=False) as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_invoice_extractor] = lambda: fake_extractor
    # raise_server_exceptions=False: we want to see the 500 JSON our handler produces
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()
