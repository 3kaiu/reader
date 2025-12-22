# 独立 Rust 后端构建 (不含前端)
# 适用于开发环境或前端单独部署场景

FROM rust:1.83-alpine AS builder

RUN apk add --no-cache musl-dev

WORKDIR /app

# 复制依赖文件
COPY Cargo.toml Cargo.lock ./

# 缓存依赖
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release && rm -rf src

# 复制源码并构建
COPY src ./src
RUN touch src/main.rs && cargo build --release

# 运行阶段
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata

ENV TZ=Asia/Shanghai
WORKDIR /app

# 复制二进制
COPY --from=builder /app/target/release/reader-rs /app/reader-rs

# 存储目录
RUN mkdir -p /app/storage/data /app/storage/cache
VOLUME ["/app/storage"]

# 可选: 复制预构建的前端 (需要先手动构建 web-v3)
# COPY web /web

EXPOSE 8080

CMD ["/app/reader-rs"]
