# Nexus-Lite Dockerfile for HuggingFace Spaces
# Build context: nexus-lite directory (used when GH Actions uploads this folder to HF)
# Cache bust: 20260203

FROM rust:1.85-slim-bookworm AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy workspace files (context = nexus-lite/)
COPY Cargo.toml Cargo.lock ./
COPY nexus-core ./nexus-core
COPY nexus-engine ./nexus-engine
COPY nexus-storage ./nexus-storage
COPY nexus-server ./nexus-server
COPY data ./data

# Build release binary
RUN cargo build --release --package nexus-server

# Runtime stage
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
COPY data ./data

# Create cache directory
RUN mkdir -p /app/cache

# HuggingFace Spaces requires port 7860
ENV HOST=0.0.0.0
ENV PORT=7860
ENV RUST_LOG=info

EXPOSE 7860

CMD ["./nexus-server"]
