from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import JSON, DateTime, Index, Integer, LargeBinary, String, Text, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# JSONB on PostgreSQL (indexable, binary), plain JSON elsewhere (lets unit tests run on SQLite).
JsonType = JSON().with_variant(JSONB(), "postgresql")


class Invoice(Base):
    __tablename__ = "invoices"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    filename: Mapped[str] = mapped_column(String(255))
    # sha256 hex of the uploaded bytes; UNIQUE is what makes duplicate detection race-safe.
    file_hash: Mapped[str] = mapped_column(String(64), unique=True)
    extraction_method: Mapped[str] = mapped_column(String(20))  # text_layer | ocr
    status: Mapped[str] = mapped_column(String(20))  # valid | needs_review | failed
    raw_text: Mapped[str] = mapped_column(Text)
    extracted_json: Mapped[Optional[Any]] = mapped_column(JsonType, nullable=True)
    validation_issues: Mapped[Optional[Any]] = mapped_column(JsonType, nullable=True)
    model_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    prompt_tokens: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    completion_tokens: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Added in migration 0002. Nullable so rows created before it stay valid.
    processing_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # whole pipeline
    llm_latency_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # OpenAI call only
    content_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    # The original upload (<= MAX_UPLOAD_MB), kept so the UI can show it next to the extracted data.
    # deferred: never loaded by list/get queries, only when explicitly accessed.
    file_content: Mapped[Optional[bytes]] = mapped_column(LargeBinary, nullable=True, deferred=True)

    __table_args__ = (
        Index("ix_invoices_status", "status"),
        Index("ix_invoices_created_at", "created_at"),
    )
