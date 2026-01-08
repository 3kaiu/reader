# =============================================================================
# ULTIMATE OPTIMIZATION for cf-bypass-service
# Using Nuitka to compile Python into a standalone binary
# =============================================================================

# Stage 1: Builder
FROM python:3.11-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache \
    gcc \
    musl-dev \
    libffi-dev \
    curl \
    python3-dev \
    build-base \
    patchelf

# Install uv, Nuitka and ccache for faster recompilation
RUN apk add --no-cache ccache
RUN pip install --no-cache-dir uv nuitka

# Copy project definition
COPY pyproject.toml uv.lock ./
RUN uv pip install --system --no-cache -r pyproject.toml

# Copy source code
COPY app.py scraper.py ./

# Compile with Nuitka
# --standalone: includes the Python interpreter
# --remove-output: cleans up C files
# --jobs: Use all available cores
RUN python -m nuitka \
    --standalone \
    --remove-output \
    --jobs=$(nproc) \
    --include-package=fastapi \
    --include-package=uvicorn \
    --include-package=js2py \
    --include-package=curl_cffi \
    --output-dir=build \
    --output-filename=cf-bypass \
    app.py

# Stage 2: Runtime
FROM alpine:3.19
WORKDIR /app

# Install runtime dependencies (need libstdc++ for compiled python)
RUN apk add --no-cache curl tzdata ca-certificates libstdc++

# Copy the compiled standalone directory
COPY --from=builder /app/build/app.dist /app/cf-bypass

# Create data directory
RUN mkdir -p /app/data/qidian

# Environment defaults
ENV HOST=0.0.0.0
ENV PORT=8000
ENV JS_INTERPRETER=js2py
ENV REQUEST_TIMEOUT=90

EXPOSE 8000

# Run the compiled binary from the standalone folder
CMD ["/app/cf-bypass/cf-bypass"]
