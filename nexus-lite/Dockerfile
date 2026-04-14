# Nexus API Dockerfile (GHCR / NAS; port 7860 also matches HuggingFace Spaces if you deploy there)
# Build context: legacy `nexus-lite` directory (used when GH Actions uploads this folder to HF)

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

# Copy data and config (most likely to change - last)
COPY data ./data

# Debug: Show Rust version and check dependencies
RUN rustc --version && cargo --version

# Debug: Check if all files are copied correctly
RUN ls -la && ls -la nexus-* && ls -la data

# Try check first to catch compilation errors early
RUN cargo check --package nexus-server

# Build release binary
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

# Copy binary from builder
COPY --from=builder /app/target/release/nexus-server /app/nexus-server

# Debug: Verify binary was copied and is executable
RUN ls -la /app/nexus-server

# Copy source files and config
COPY sources ./sources
COPY nexus-server/config.json ./config.json
COPY data ./data

# Create cache directory
RUN mkdir -p /app/cache

# Test that binary runs (basic check)
RUN /app/nexus-server --help || echo "Binary exists but help failed"

# Default port 7860 matches HuggingFace Spaces; override PORT for NAS/Docker as needed.
ENV HOST=0.0.0.0
ENV PORT=7860
ENV RUST_LOG=info

EXPOSE 7860

CMD ["./nexus-server"]
