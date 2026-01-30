# =============================================================================
# Dockerfile for cf-bypass-service
# Optimized for HuggingFace Spaces with Camoufox (Hardened Firefox) support
# =============================================================================

FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for both Chrome and Firefox (Camoufox)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    wget \
    gnupg \
    unzip \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libwayland-client0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    xdg-utils \
    # Chromium/Firefox additional dependencies
    libnss3 \
    libnspr4 \
    libgbm1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libdbus-glib-1-2 \
    libxt6 \
    libxshmfence1 \
    libglu1-mesa \
    && rm -rf /var/lib/apt/lists/*

# Install uv for faster dependency management
RUN pip install uv

# Copy dependency files
COPY pyproject.toml uv.lock* ./

# Install Python dependencies with uv
RUN uv pip install --system --no-cache \
    fastapi uvicorn cloudscraper pydantic cachetools js2py redis psutil \
    curl_cffi nodriver patchright DrissionPage camoufox[pw] CloudflareBypasser xxhash

# Install browsers
# Install browsers and their dependencies
RUN python -m patchright install chromium --with-deps
RUN python -m playwright install firefox --with-deps
# Camoufox will fetch its own binary or use playwright's; 
# optionally pre-fetch if needed, but 'playwright install' usually suffices for deps.

# Copy source code
COPY *.py ./
COPY core ./core
COPY domain_configs.json ./

# Create data directories
RUN mkdir -p /app/data /tmp/drission_profile /tmp/camoufox_profile

# HuggingFace Spaces requires port 7860
ENV HOST=0.0.0.0
ENV PORT=7860
ENV JS_INTERPRETER=js2py
ENV REQUEST_TIMEOUT=90
ENV DISPLAY=:99

EXPOSE 7860

# Run with uvicorn on port 7860 (HuggingFace requirement)
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
