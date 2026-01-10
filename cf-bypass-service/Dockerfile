# =============================================================================
# High-Performance Dockerfile for cf-bypass-service
# Optimized for small size and fast build times using Alpine multi-stage
# =============================================================================

# Stage 1: Builder
FROM python:3.11-alpine AS builder

WORKDIR /app

# Install build dependencies for C extensions (required by curl_cffi, etc.)
RUN apk add --no-cache \
    gcc \
    musl-dev \
    libffi-dev \
    curl \
    python3-dev \
    build-base

# Install uv for fast dependency resolution
RUN pip install --no-cache-dir uv

# Copy project definition
COPY pyproject.toml uv.lock ./

# Install dependencies into a specific site-packages
RUN uv pip install --system --no-cache -r pyproject.toml

# Stage 2: Runtime
FROM python:3.11-alpine
WORKDIR /app

# Install minimal runtime dependencies
RUN apk add --no-cache curl tzdata ca-certificates libstdc++

# Copy installed packages from builder
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy source code
COPY app.py cloudscraper_wrapper.py config_manager.py config_validator.py enhanced_logger.py error_handler.py ./

# Create data directory
RUN mkdir -p /app/data/qidian

# Environment defaults
ENV HOST=0.0.0.0
ENV PORT=8000
ENV JS_INTERPRETER=js2py
ENV REQUEST_TIMEOUT=90

EXPOSE 8000

# Run with uvicorn
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
