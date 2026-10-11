from __future__ import annotations

from functools import lru_cache
from typing import Optional

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings, loaded from environment variables (and .env for local runs)."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",  # .env also holds POSTGRES_* vars used only by docker-compose
    )

    app_env: str = "development"
    # Swagger UI (/docs) and /openapi.json are served without an API key; switch off if the
    # service is exposed publicly.
    enable_docs: bool = True
    log_level: str = "INFO"

    # SecretStr keeps the value out of repr()/logs by accident.
    api_key: SecretStr
    database_url: str

    max_upload_mb: int = Field(default=10, gt=0)
    max_pdf_pages: int = Field(default=5, gt=0)

    # Optional at startup so the app (and unit tests) run without a key; the extraction endpoint
    # answers 503 if it is missing.
    openai_api_key: Optional[SecretStr] = None
    openai_model: str = "gpt-6-luna"
    openai_timeout_seconds: float = Field(default=60.0, gt=0)
    # The SDK retries connection errors, 408/409/429 and 5xx with exponential backoff.
    openai_max_retries: int = Field(default=2, ge=0, le=5)
    openai_max_output_tokens: int = Field(default=8000, gt=0)
    # Refuse (instead of silently truncating) documents whose text is longer than this.
    max_llm_input_chars: int = Field(default=40_000, gt=0)

    # Tesseract language codes joined with "+", e.g. "eng" or "eng+rus". Must be installed.
    ocr_languages: str = Field(default="eng", pattern=r"^[A-Za-z_]+(\+[A-Za-z_]+)*$")
    # Only needed when the tesseract binary is not on PATH (typical on Windows).
    tesseract_cmd: Optional[str] = None

    @field_validator("openai_api_key", "tesseract_cmd", mode="before")
    @classmethod
    def _blank_means_unset(cls, value):
        # `KEY=` in a .env file arrives as "", which must behave like "not configured".
        if isinstance(value, str) and value.strip() == "":
            return None
        return value

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # required fields come from the environment
