# =============================================================================
# Dockerfile for the bypass service
# Minimal image for cloudscraper fetch
# =============================================================================

FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install uv for faster dependency management
RUN pip install uv

# Copy dependency files
COPY pyproject.toml uv.lock* ./

# Install Python dependencies with uv
RUN uv pip install --system --no-cache \
    fastapi uvicorn cloudscraper pydantic

# Copy source code
COPY *.py ./
COPY core ./core
COPY engines ./engines

# Create data directories
RUN mkdir -p /app/data

ENV HOST=0.0.0.0
ENV PORT=8000

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
