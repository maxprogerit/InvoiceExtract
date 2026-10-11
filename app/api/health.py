from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db

router = APIRouter(tags=["health"])
logger = logging.getLogger(__name__)


@router.get("/health")
def health(response: Response, db: Session = Depends(get_db)) -> dict:
    """Liveness + readiness in one: the process is up AND the database answers."""
    try:
        db.execute(text("SELECT 1"))
    except Exception:  # any DB failure means "not ready"; details go to the log, not the client
        logger.exception("health check: database unreachable")
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"status": "degraded", "database": "down"}
    return {"status": "ok", "database": "up"}
