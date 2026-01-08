# =============================================================================
# Multi-stage Dockerfile for NexusLite (Rust Backend + Vue Frontend)
# Optimized with cargo-chef for dependency caching
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Build Frontend (Vue + Rsbuild)
# -----------------------------------------------------------------------------
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files first for better caching
COPY nexus-reader/package.json nexus-reader/pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source files
COPY nexus-reader/ ./

# Build production bundle
RUN pnpm build

# -----------------------------------------------------------------------------
# Stage 2: Chef (Prepare recipe)
# -----------------------------------------------------------------------------
FROM lukemathwalker/cargo-chef:latest-rust-1-slim AS chef
WORKDIR /app

# -----------------------------------------------------------------------------
# Stage 3: Planner (Generate recipe.json)
# -----------------------------------------------------------------------------
FROM chef AS planner
COPY nexus-lite/ .
RUN cargo chef prepare --recipe-path recipe.json

# -----------------------------------------------------------------------------
# Stage 4: Builder (Build dependencies and binary)
# -----------------------------------------------------------------------------
FROM chef AS builder

# Install build dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    cmake \
    perl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=planner /app/recipe.json recipe.json

# Build dependencies - this is the caching layer!
RUN cargo chef cook --release --recipe-path recipe.json

# Build application
COPY nexus-lite/ .
RUN cargo build --release --bin nexus-server

# -----------------------------------------------------------------------------
# Stage 5: Runtime
# -----------------------------------------------------------------------------
FROM debian:bookworm-slim

# OCI Labels
LABEL org.opencontainers.image.title="NexusLite"
LABEL org.opencontainers.image.description="Lightweight book source aggregation engine with embedded frontend"
LABEL org.opencontainers.image.source="https://github.com/3kaiu/reader"

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN groupadd --gid 1000 nexus \
    && useradd --uid 1000 --gid nexus --shell /bin/bash --create-home nexus

# Copy Rust binary from builder
COPY --from=builder /app/target/release/nexus-server /app/nexus-server

# Copy Vue frontend from frontend builder
COPY --from=frontend-builder /app/dist /app/static

# Copy default book sources
COPY nexus-lite/sources /app/sources

# Create directories with correct ownership
RUN mkdir -p /app/data /app/cache \
    && chown -R nexus:nexus /app

# Switch to non-root user
USER nexus

# Environment defaults
ENV RUST_LOG=info
ENV HOST=0.0.0.0
ENV PORT=8080
ENV STATIC_DIR=/app/static

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/api/health || exit 1

# Expose port
EXPOSE 8080

# Run
CMD ["/app/nexus-server"]
