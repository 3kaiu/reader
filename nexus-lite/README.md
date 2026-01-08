# NexusLite

**轻量级、高性能的中文网络小说书源引擎**

## 项目结构

```
nexus-lite/
├── nexus-core/          # 核心类型定义 (Traits, Error, Models)
├── nexus-engine/        # 业务引擎 (Fetcher, Parser, Anti-crawl)
├── nexus-storage/       # 存储层 (JSON, SQLite, FileCache)
├── nexus-server/        # HTTP API 服务 (Axum)
└── Dockerfile

cf-bypass-service/       # Cloudflare 绕过服务 (Python)
├── app.py              # FastAPI 入口
├── scraper.py          # CloudScraper v3.0 引擎
└── pyproject.toml
```

## 快速开始

### 1. 本地开发

```bash
# 编译 NexusLite
cd nexus-lite
cargo build --release

# 创建数据目录
mkdir -p data sources cache

# 运行
./target/release/nexus-server
```

### 2. 启动 CF Bypass Service

```bash
cd cf-bypass-service

# 安装依赖
uv sync

# 运行服务
uv run uvicorn app:app --host 0.0.0.0 --port 8000
```

### 3. Docker 部署

```bash
# 从 reader 根目录
docker-compose -f docker-compose.nexus.yml up -d

# 查看日志
docker-compose -f docker-compose.nexus.yml logs -f
```

## API 端点

### NexusLite (Port 8080)

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/health` | GET | 健康检查 |
| `/api/sources` | GET | 获取书源列表 |
| `/api/sources/{id}` | GET | 获取单个书源 |
| `/api/search` | POST | 搜索书籍 |
| `/api/book` | GET | 获取书籍信息 |
| `/api/chapters` | GET | 获取章节列表 |
| `/api/content` | GET | 获取章节内容 |
| `/api/bookshelf` | GET/POST/PATCH/DELETE | 书架管理 |

### CF Bypass Service (Port 8000)

| 端点 | 方法 | 描述 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/fetch` | POST | 请求 URL (自动绕过 CF) |
| `/stats` | GET | 引擎统计信息 |

## 配置

### 环境变量 (NexusLite)

| 变量 | 默认值 | 描述 |
|------|--------|------|
| `RUST_LOG` | info | 日志级别 |
| `HOST` | 0.0.0.0 | 监听地址 |
| `PORT` | 8080 | 监听端口 |
| `CF_SERVICE_URL` | http://localhost:8000 | CF Bypass 服务地址 |
| `CF_SERVICE_KEY` | - | CF 服务 API Key |

### 环境变量 (CF Bypass)

| 变量 | 默认值 | 描述 |
|------|--------|------|
| `CF_API_KEY` | - | API 认证密钥 |
| `JS_INTERPRETER` | js2py | JS 解释器 |
| `REQUEST_TIMEOUT` | 90 | 请求超时 (秒) |

## 技术栈

### NexusLite (Rust)
- tokio 1.x - 异步运行时
- axum 0.7 - HTTP 框架
- reqwest 0.12 - HTTP 客户端
- scraper - HTML 解析
- rusqlite - SQLite 数据库

### CF Bypass (Python)
- FastAPI - HTTP 框架
- CloudScraper v3.0 - CF 绕过 (100% 内置功能)
- uv - 包管理

## License

MIT License
