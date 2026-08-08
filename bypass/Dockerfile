# =============================================================================
# Dockerfile for the bypass service
# Minimal image for cloudscraper fetch
# =============================================================================

FROM python:3.14-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install uv for faster dependency management
RUN pip install uv

# Create non-root user
RUN useradd --create-home --shell /bin/bash nexus

# Copy dependency files
COPY pyproject.toml uv.lock ./

# Install runtime dependencies from lockfile (reproducible)
RUN uv sync --frozen --no-dev --no-install-project && chown -R nexus:nexus /app

# Copy source code
COPY --chown=nexus:nexus *.py ./
COPY --chown=nexus:nexus core ./core
COPY --chown=nexus:nexus engines ./engines

ENV HOST=0.0.0.0
ENV PORT=8000

USER nexus

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
