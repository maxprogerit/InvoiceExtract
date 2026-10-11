from __future__ import annotations

from typing import Any, Dict, Iterator, Optional

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""


_engine: Optional[Engine] = None
_session_factory: Optional[sessionmaker] = None


def get_engine() -> Engine:
    # Created lazily so importing the app (e.g. in tests) does not require a reachable database.
    global _engine, _session_factory
    if _engine is None:
        url = get_settings().database_url
        options: Dict[str, Any] = {"pool_pre_ping": True}
        if url.startswith("postgresql"):
            options.update(
                # A request holds its connection while the pipeline runs (advisory lock), so size
                # the pool for concurrent uploads and fail with a clear timeout, not forever.
                pool_size=10,
                max_overflow=10,
                pool_timeout=30,
                # connect_timeout: fail fast when the DB is unreachable instead of hanging the
                # request (and the /health probe) on the OS-level TCP timeout.
                connect_args={"connect_timeout": 5},
            )
        _engine = create_engine(url, **options)
        _session_factory = sessionmaker(bind=_engine, expire_on_commit=False)
    return _engine


def get_db() -> Iterator[Session]:
    """FastAPI dependency: one session per request, always closed afterwards."""
    get_engine()
    assert _session_factory is not None
    with _session_factory() as session:
        yield session
