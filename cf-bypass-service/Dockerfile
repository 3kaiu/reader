# =============================================================================
# Optimized Dockerfile for cf-bypass-service
# Using Alpine and Multi-stage builds for minimum footprint
# =============================================================================

# Stage 1: Builder
FROM python:3.11-alpine AS builder

WORKDIR /app

# Install build dependencies for C extensions
RUN apk add --no-cache \
    gcc \
    musl-dev \
    libffi-dev \
    curl

# Install uv
RUN pip install --no-cache-dir uv

# Copy project definition
COPY pyproject.toml uv.lock ./

# Install dependencies
# Using --system in alpine builder to prepare the libs
RUN uv pip install --system --no-cache -r pyproject.toml

# Stage 2: Runtime
FROM python:3.11-alpine
WORKDIR /app

# Install runtime dependencies (curl for healthcheck)
RUN apk add --no-cache curl tzdata

# Copy installed packages from builder
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy source code
COPY app.py scraper.py ./

# Create data directory
RUN mkdir -p /app/data/qidian

# Environment defaults
ENV HOST=0.0.0.0
ENV PORT=8000
ENV JS_INTERPRETER=js2py
ENV REQUEST_TIMEOUT=90

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
