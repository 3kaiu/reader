FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install uv for faster package management
RUN pip install --no-cache-dir uv

# Copy project definition first (caching layer)
COPY pyproject.toml uv.lock ./

# Install dependencies with uv (use --no-cache to avoid lock issues)
# This layer will be cached unless pyproject.toml/uv.lock changes
RUN uv pip install --system --no-cache -r pyproject.toml

# Copy source code (this changes frequently)
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

# Run
EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
