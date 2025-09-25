# syntax=docker/dockerfile:1.4
ARG PYTHON_VERSION=3.11
FROM python:${PYTHON_VERSION}-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=on \
    PIP_NO_CACHE_DIR=off

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    git \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --upgrade pip

WORKDIR /app

COPY requirements.txt ./requirements.txt
COPY dev-requirements.txt ./dev-requirements.txt

RUN pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir -r dev-requirements.txt

FROM base AS development
ARG UID=1000
ARG GID=1000

RUN groupadd --gid "${GID}" app \
    && useradd --uid "${UID}" --gid app --shell /bin/bash --create-home app

ENV PATH="/home/app/.local/bin:${PATH}"

WORKDIR /app

RUN mkdir -p /app/backend /app/logs /app/cache /app/loras /app/outputs \
    && chown -R app:app /app

USER app

ENV UVICORN_APP=backend.main:app \
    UVICORN_PORT=8000 \
    UVICORN_HOST=0.0.0.0

CMD ["uvicorn", "backend.main:app", "--reload", "--host", "0.0.0.0", "--port", "8000"]
