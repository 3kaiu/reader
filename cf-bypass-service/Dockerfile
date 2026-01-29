# =============================================================================
# Dockerfile for cf-bypass-service
# Optimized for HuggingFace Spaces deployment
# =============================================================================

FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY pyproject.toml ./
RUN pip install --no-cache-dir \
    fastapi>=0.104.0 \
    uvicorn>=0.24.0 \
    cloudscraper>=1.2.70 \
    pydantic>=2.5.0 \
    cachetools>=5.3.0 \
    js2py>=0.74 \
    redis>=5.0.0 \
    psutil>=5.9.0

# Copy source code
COPY *.py ./
COPY core ./core
COPY domain_configs.json ./

# Create data directory
RUN mkdir -p /app/data

# HuggingFace Spaces requires port 7860
ENV HOST=0.0.0.0
ENV PORT=7860
ENV JS_INTERPRETER=js2py
ENV REQUEST_TIMEOUT=90

EXPOSE 7860

# Run with uvicorn on port 7860 (HuggingFace requirement)
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
