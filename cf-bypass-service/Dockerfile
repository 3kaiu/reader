# =============================================================================
# Optimized Dockerfile for cf-bypass-service
# Using multi-stage build to reduce final image size
# =============================================================================

# Stage 1: Builder
FROM python:3.11-slim AS builder

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install uv
RUN pip install --no-cache-dir uv

# Copy project definition
COPY pyproject.toml uv.lock ./

# Install dependencies into a specific directory
RUN uv pip install --system --no-cache -r pyproject.toml

# Stage 2: Runtime
FROM python:3.11-slim
WORKDIR /app

# Install minimal runtime dependencies (curl for healthcheck)
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy installed packages from builder
# Note: Since we used --system in builder, they are in site-packages
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
