# =============================================================================
# Multi-stage Dockerfile for NexusLite (Rust Backend + Vue Frontend)
# OPTIMIZED: Alpine + musl + UPX + Brotli Pre-compression
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

# Stage 3: Planner (Generate recipe.json)
# -----------------------------------------------------------------------------
FROM chef AS planner
COPY nexus-lite/Cargo.toml nexus-lite/Cargo.lock ./
COPY nexus-lite/nexus-core/Cargo.toml nexus-core/Cargo.toml
COPY nexus-lite/nexus-engine/Cargo.toml nexus-engine/Cargo.toml
COPY nexus-lite/nexus-storage/Cargo.toml nexus-storage/Cargo.toml
COPY nexus-lite/nexus-server/Cargo.toml nexus-server/Cargo.toml
RUN mkdir -p nexus-core/src nexus-engine/src nexus-storage/src nexus-server/src \
    && touch nexus-core/src/lib.rs nexus-engine/src/lib.rs nexus-storage/src/lib.rs nexus-server/src/main.rs
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

# Use UPX for fast binary compression (trade-off: slightly larger size, much faster build)
RUN upx --fast /app/target/x86_64-unknown-linux-musl/release/nexus-server

# -----------------------------------------------------------------------------
# Stage 5: Runtime (Alpine for better compatibility/permissions)
# -----------------------------------------------------------------------------
FROM alpine:3.19
WORKDIR /app

# Install minimal runtime dependencies
RUN apk add --no-cache ca-certificates curl tzdata

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

# Re-enable healthcheck since curl is available
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/api/health || exit 1

ENTRYPOINT ["/app/nexus-server"]
