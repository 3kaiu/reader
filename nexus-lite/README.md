---
title: Nexus Lite
emoji: 📚
colorFrom: blue
colorTo: purple
sdk: docker
pinned: false
---

# Nexus-Lite

轻量级小说聚合引擎，支持多书源搜索和内容抓取。

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Cloudflare (免费)                         │
├─────────────────────────────────────────────────────────────┤
│  CF Pages          │  CF Worker (Proxy)                      │
│  nexus-reader      │  - 转发请求到 HF                        │
│  (前端)            │  - 保活 ping (每25分钟)                  │
│                    │  - CORS 处理                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  HuggingFace Spaces (免费)                   │
├─────────────────────────────────────────────────────────────┤
│  nexus-lite        │  cf-bypass-service                      │
│  (Rust 后端)       │  (Python CF绕过)                        │
│  Port: 7860        │  Port: 7860                             │
└─────────────────────────────────────────────────────────────┘
```

## 部署

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `HOST` | 监听地址 | `0.0.0.0` |
| `PORT` | 监听端口 | `8080` (HF: `7860`) |
| `CF_SERVICE_URL` | cf-bypass 服务地址 | `http://localhost:8000` |
| `ALLOWED_ORIGINS` | CORS 允许的源 (逗号分隔) | 空 (允许所有) |
| `RUST_LOG` | 日志级别 | `info` |

### HuggingFace Spaces 部署

1. 创建 Docker 类型的 Space
2. 推送代码到 Space 仓库
3. HuggingFace 会自动构建和部署

### 本地开发

```bash
cd nexus-lite
cargo run --release --package nexus-server
```

## API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/sources` | GET | 获取书源列表 |
| `/search` | POST | 搜索书籍 |
| `/book` | GET | 获取书籍详情 |
| `/toc` | GET | 获取目录 |
| `/content` | GET | 获取章节内容 |
| `/ws` | WebSocket | 实时搜索 |

## 书源格式 (.nxs)

书源使用 JSON 格式定义，支持：
- CSS 选择器
- JSONPath
- 正则表达式
- 内容过滤和替换

示例见 `sources/` 目录。
