FROM python:3.12-slim

# Space-separated Tesseract language packs to install, e.g. --build-arg TESSERACT_LANGS="eng rus".
# OCR_LANGUAGES (runtime) must only name packs that were installed here.
ARG TESSERACT_LANGS="eng"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends tesseract-ocr $(for l in $TESSERACT_LANGS; do printf 'tesseract-ocr-%s ' "$l"; done) \
    && rm -rf /var/lib/apt/lists/*

# Unprivileged user: a bug in PDF/image parsing must not run as root.
RUN useradd --create-home --uid 10001 appuser

WORKDIR /app

# Dependencies first so this layer is cached until requirements.txt changes.
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app

USER appuser
EXPOSE 8000

# One process per container; scale by running more containers, not --workers.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
