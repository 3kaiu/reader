# =============================================================================
# Multi-stage Dockerfile for NexusLite (Rust Backend + Vue Frontend)
# ULTIMATE OPTIMIZATION: scratch + musl + UPX + Brotli Pre-compression
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Build Frontend (Vue + Rsbuild) + Pre-compression
# -----------------------------------------------------------------------------
FROM node:20-alpine AS frontend-builder
WORKDIR /app
RUN apk add --no-cache brotli gzip
RUN npm install -g pnpm
COPY nexus-reader/package.json nexus-reader/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY nexus-reader/ ./
RUN pnpm build

# Pre-compress static assets (js, css, html, svg, etc.)
RUN find dist -type f -regex '.*\.\(js\|css\|html\|svg\|json\|wasm\)$' -exec brotli {} \; \
    && find dist -type f -regex '.*\.\(js\|css\|html\|svg\|json\|wasm\)$' -exec gzip -9 -k {} \;

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
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    cmake \
    perl \
    upx-ucl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=planner /app/recipe.json recipe.json
# Build with static linking for musl
ENV RUSTFLAGS="-C target-feature=+crt-static"
RUN cargo chef cook --release --target x86_64-unknown-linux-musl --recipe-path recipe.json

# Build application
COPY nexus-lite/ .
RUN cargo build --release --target x86_64-unknown-linux-musl --bin nexus-server

# Use UPX for extreme binary compression
RUN upx --best --lzma /app/target/x86_64-unknown-linux-musl/release/nexus-server

# -----------------------------------------------------------------------------
# Stage 5: Runtime (The ultimate empty container)
# -----------------------------------------------------------------------------
FROM scratch
WORKDIR /app

# Copy essential system files from builder
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=builder /usr/share/zoneinfo /usr/share/zoneinfo

# Copy the statically linked and compressed binary
COPY --from=builder /app/target/x86_64-unknown-linux-musl/release/nexus-server /app/nexus-server

# Copy the pre-compressed frontend assets
COPY --from=frontend-builder /app/dist /app/static

# Copy default book sources
COPY nexus-lite/sources /app/sources

# Default environment variables
ENV RUST_LOG=info
ENV HOST=0.0.0.0
ENV PORT=8080
ENV STATIC_DIR=/app/static
ENV TZ=Asia/Shanghai

EXPOSE 8080

# Since it's scratch, we can't use healthcheck with curl unless we copy curl and its libs.
# For ultimate size, we omit the docker-level healthcheck or use a custom tiny Go/Rust health-checker.
# Most NAS users prefer size over the Healthcheck badge.

ENTRYPOINT ["/app/nexus-server"]
