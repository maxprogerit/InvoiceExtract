from __future__ import annotations

import secrets
from typing import Optional

from fastapi import Depends
from fastapi.security import APIKeyHeader

from app.core.config import Settings, get_settings
from app.core.errors import UnauthorizedError

# auto_error=False so we raise our own error shape; using the scheme also adds the
# "Authorize" button to /docs.
_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


def require_api_key(
    provided: Optional[str] = Depends(_api_key_header),
    settings: Settings = Depends(get_settings),
) -> None:
    expected = settings.api_key.get_secret_value()
    # compare_digest: constant-time comparison, no timing side channel on the key.
    if not provided or not secrets.compare_digest(provided.encode(), expected.encode()):
        raise UnauthorizedError("Invalid or missing API key")
