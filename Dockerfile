# =============================================================================
# Multi-stage Dockerfile for NexusLite (Rust Backend + Vue Frontend)
# Optimized for minimum image size with Alpine, musl, and UPX
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Build Frontend (Vue + Rsbuild)
# -----------------------------------------------------------------------------
FROM node:20-alpine AS frontend-builder
WORKDIR /app
RUN npm install -g pnpm
COPY nexus-reader/package.json nexus-reader/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY nexus-reader/ ./
RUN pnpm build

# -----------------------------------------------------------------------------
# Stage 2: Chef (Prepare recipe)
# -----------------------------------------------------------------------------
FROM lukemathwalker/cargo-chef:latest-rust-1-slim AS chef
WORKDIR /app
RUN apt-get update && apt-get install -y musl-tools && rm -rf /var/lib/apt/lists/*
RUN rustup target add x86_64-unknown-linux-musl

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
# Install build dependencies + UPX
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    cmake \
    perl \
    upx-ucl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=planner /app/recipe.json recipe.json
RUN cargo chef cook --release --target x86_64-unknown-linux-musl --recipe-path recipe.json

# Build application
COPY nexus-lite/ .
RUN cargo build --release --target x86_64-unknown-linux-musl --bin nexus-server

# Compress binary with UPX (Ultimate Packer for eXecutables)
# Use --best --lzma for maximum compression ratio
RUN upx --best --lzma /app/target/x86_64-unknown-linux-musl/release/nexus-server

# -----------------------------------------------------------------------------
# Stage 5: Runtime
# -----------------------------------------------------------------------------
FROM alpine:3.19
WORKDIR /app

RUN apk add --no-cache ca-certificates curl tzdata

# Create non-root user
RUN addgroup -S nexus && adduser -S nexus -G nexus

# Copy Compressed Rust binary
COPY --from=builder /app/target/x86_64-unknown-linux-musl/release/nexus-server /app/nexus-server

# Copy Vue frontend
COPY --from=frontend-builder /app/dist /app/static

# Copy default book sources
COPY nexus-lite/sources /app/sources

RUN mkdir -p /app/data /app/cache && chown -R nexus:nexus /app
USER nexus

ENV RUST_LOG=info
ENV HOST=0.0.0.0
ENV PORT=8080
ENV STATIC_DIR=/app/static

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/api/health || exit 1

EXPOSE 8080
CMD ["/app/nexus-server"]
