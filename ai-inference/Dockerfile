# =============================================================================
# Dockerfile for the AI inference service
# Sidecar container for alias decoding + chapter scanning
# =============================================================================

FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN pip install uv

RUN useradd --create-home --shell /bin/bash nexus

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project && chown -R nexus:nexus /app

COPY --chown=nexus:nexus . .

ENV HOST=0.0.0.0
ENV PORT=8001

USER nexus

EXPOSE 8001

CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
