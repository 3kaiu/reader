# Nexus API Dockerfile (GHCR / NAS; default runtime port 7860)
# Build context: `api` directory

FROM rust:1.85-slim-bookworm AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy rust toolchain
COPY rust-toolchain.toml ./

# Copy dependency files first for better caching
COPY Cargo.toml Cargo.lock ./

# Copy source code (order matters for caching - least changing first)
COPY nexus-core ./nexus-core
COPY nexus-storage ./nexus-storage
COPY nexus-engine ./nexus-engine
COPY nexus-server ./nexus-server

# Debug: Show Rust version and check dependencies
RUN rustc --version && cargo --version

# Debug: Check if all files are copied correctly
RUN ls -la && ls -la nexus-*/

# Build release binary (skip cargo check — build alone is sufficient)
RUN cargo build --release --package nexus-server

# Debug: Check if binary was created
RUN ls -la target/release/nexus-server

# Runtime stage
FROM debian:bookworm-slim

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r nexus && useradd -r -g nexus nexus

# Copy binary from builder
COPY --from=builder /app/target/release/nexus-server /app/nexus-server

# Copy source files and config
COPY sources ./sources
COPY nexus-server/config.json ./config.json

# Create cache directory
RUN mkdir -p /app/cache && chown -R nexus:nexus /app/cache /app/sources /app/config.json

# Default port 7860; override PORT for NAS/Docker as needed.
ENV HOST=0.0.0.0
ENV PORT=7860
ENV RUST_LOG=info

# Switch to non-root user
USER nexus

EXPOSE 7860

CMD ["./nexus-server"]
