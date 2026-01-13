# =============================================================================
# Dockerfile for nexus-lite (HuggingFace Spaces deployment)
# Multi-stage build for minimal image size
# =============================================================================

# Stage 1: Build
FROM rust:1.85-slim-bookworm AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy workspace files
COPY Cargo.toml Cargo.lock ./
COPY nexus-core ./nexus-core
COPY nexus-engine ./nexus-engine
COPY nexus-storage ./nexus-storage
COPY nexus-server ./nexus-server

# Build release binary
RUN cargo build --release --package nexus-server

# Stage 2: Runtime
FROM debian:bookworm-slim

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy binary from builder
COPY --from=builder /app/target/release/nexus-server /app/nexus-server

# Copy source files and config
COPY sources ./sources
COPY nexus-server/config.json ./config.json

# Create data directory
RUN mkdir -p /app/data /app/cache

# HuggingFace Spaces requires port 7860
ENV HOST=0.0.0.0
ENV PORT=7860
ENV RUST_LOG=info

EXPOSE 7860

# Run the server
CMD ["./nexus-server"]
