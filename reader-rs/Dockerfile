# 多阶段构建 - Rust 后端
FROM rust:1.83-alpine AS builder

# 安装构建依赖
RUN apk add --no-cache musl-dev

WORKDIR /app

# 复制依赖文件
COPY Cargo.toml Cargo.lock ./

# 创建空 src 用于缓存依赖
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release && rm -rf src

# 复制源代码
COPY src ./src

# 构建发布版本
RUN touch src/main.rs && cargo build --release

# 运行阶段 - 极小镜像
FROM alpine:3.20

# 安装运行时依赖
RUN apk add --no-cache ca-certificates tzdata

# 设置时区
ENV TZ=Asia/Shanghai

WORKDIR /app

# 复制编译后的二进制
COPY --from=builder /app/target/release/reader-rs /app/reader-rs

# 复制前端静态文件
# COPY web-v3/dist /app/web

EXPOSE 8080

CMD ["/app/reader-rs"]
