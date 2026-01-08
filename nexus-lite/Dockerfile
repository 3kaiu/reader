# Build stage
FROM rust:1.75-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y \
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
RUN cargo build --release --bin nexus-server

# Runtime stage
FROM debian:bookworm-slim

# OCI Labels
LABEL org.opencontainers.image.title="NexusLite"
LABEL org.opencontainers.image.description="Lightweight book source aggregation engine"
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

# Copy binary from builder
COPY --from=builder /app/target/release/nexus-server /app/nexus-server

# Create directories with correct ownership
RUN mkdir -p /app/data /app/sources /app/cache \
    && chown -R nexus:nexus /app

# Switch to non-root user
USER nexus

# Environment defaults
ENV RUST_LOG=info
ENV HOST=0.0.0.0
ENV PORT=8080

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/api/health || exit 1

# Run
EXPOSE 8080
CMD ["/app/nexus-server"]
