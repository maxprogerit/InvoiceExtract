from __future__ import annotations

import logging
import time
import uuid
from typing import Awaitable, Callable

from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse

from app.api import health, invoices
from app.core.config import get_settings
from app.core.errors import InvoiceExtractError
from app.core.logging import configure_logging, request_id_ctx
from app.services.ocr import configure_tesseract

logger = logging.getLogger("app.request")

PLACEHOLDER_API_KEY = "change-me"


def _error_response(request: Request, status_code: int, code: str, message: str) -> JSONResponse:
    # request.state (not the ContextVar): the ContextVar is already reset when the handler for an
    # unhandled exception runs.
    request_id = getattr(request.state, "request_id", "-")
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message, "request_id": request_id}},
        headers={"X-Request-ID": request_id},
    )


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)
    configure_tesseract(settings.tesseract_cmd)

    if settings.app_env == "production" and settings.api_key.get_secret_value() == PLACEHOLDER_API_KEY:
        raise RuntimeError("API_KEY is still the placeholder value; set a real secret before running in production")
    if settings.openai_api_key is None:
        logger.warning("OPENAI_API_KEY is not set: POST /invoices will return 503 until it is configured")

    app = FastAPI(
        title="InvoiceExtract API",
        version="0.1.0",
        description="Upload an invoice (PDF/image), get validated structured data back. "
        "Personal portfolio project.",
        docs_url="/docs" if settings.enable_docs else None,
        redoc_url=None,
        openapi_url="/openapi.json" if settings.enable_docs else None,
    )

    @app.middleware("http")
    async def request_context(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        # Reuse the caller's id if provided (useful behind a gateway), otherwise generate one.
        request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex
        request.state.request_id = request_id
        token = request_id_ctx.set(request_id)
        started = time.perf_counter()
        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
        finally:
            logger.info(
                "request completed",
                extra={
                    "method": request.method,
                    "path": request.url.path,
                    "status": status_code,
                    "latency_ms": round((time.perf_counter() - started) * 1000, 1),
                },
            )
            request_id_ctx.reset(token)
        response.headers["X-Request-ID"] = request_id
        return response

    @app.exception_handler(InvoiceExtractError)
    async def handle_domain_error(request: Request, exc: InvoiceExtractError) -> JSONResponse:
        return _error_response(request, exc.status_code, exc.code, exc.message)

    @app.exception_handler(Exception)
    async def handle_unexpected(request: Request, exc: Exception) -> JSONResponse:
        # Full stack trace goes to the log only; the client gets a generic message.
        logger.error(
            "unhandled exception",
            exc_info=(type(exc), exc, exc.__traceback__),
            extra={"request_id_from_state": getattr(request.state, "request_id", "-")},
        )
        return _error_response(request, 500, "internal_error", "An unexpected error occurred")

    app.include_router(health.router)
    app.include_router(invoices.router)
    return app


app = create_app()
