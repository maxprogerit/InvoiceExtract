from __future__ import annotations

import uuid
from typing import List, Optional, Tuple

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.invoice import Invoice


class InvoiceRepository:
    """Data access only: no business rules, no commits (the service owns the transaction)."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def get(self, invoice_id: uuid.UUID) -> Optional[Invoice]:
        return self._session.get(Invoice, invoice_id)

    def get_by_hash(self, file_hash: str) -> Optional[Invoice]:
        return self._session.scalar(select(Invoice).where(Invoice.file_hash == file_hash))

    def add(self, invoice: Invoice) -> None:
        self._session.add(invoice)
        self._session.flush()  # surfaces UNIQUE violations here, before commit

    def list(self, *, status: Optional[str], limit: int, offset: int) -> Tuple[List[Invoice], int]:
        filters = [Invoice.status == status] if status else []
        total = self._session.scalar(select(func.count()).select_from(Invoice).where(*filters)) or 0
        rows = self._session.scalars(
            select(Invoice)
            .where(*filters)
            # id as a tie-breaker keeps pagination stable when created_at values collide
            .order_by(Invoice.created_at.desc(), Invoice.id)
            .limit(limit)
            .offset(offset)
        ).all()
        return list(rows), total
