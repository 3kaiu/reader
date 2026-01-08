# CF Bypass Service

Cloudflare 绕过服务，基于 [CloudScraper v3.0](https://github.com/VeNoMouS/cloudscraper) 实现。

## 功能特性

- ✅ **Cloudflare v1/v2/v3 Challenge** - 全版本 JS 挑战支持
- ✅ **Turnstile 支持** - Cloudflare 新型验证
- ✅ **Stealth Mode** - 人类行为模拟，Header 随机化
- ✅ **会话池** - 自动健康检查，失败自动刷新
- ✅ **指数退避重试** - 智能重试策略

## 快速开始

```bash
# 安装依赖
uv sync

# 启动服务
uv run uvicorn app:app --host 0.0.0.0 --port 8000
```

## API

### POST /fetch

绕过 Cloudflare 获取页面内容。

```bash
curl -X POST http://localhost:8000/fetch \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

**请求参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| url | string | ✅ | 目标 URL |
| method | string | - | HTTP 方法，默认 GET |
| headers | object | - | 自定义请求头 |
| body | string | - | 请求体 |
| timeout | int | - | 超时秒数，默认 30 |
| proxy | string | - | 代理地址 |

**响应：**

```json
{
  "status": 200,
  "html": "<!DOCTYPE html>...",
  "cookies": {"cf_clearance": "..."},
  "headers": {"Content-Type": "text/html"},
  "cf_bypassed": true
}
```

### GET /health

健康检查。

### GET /stats

引擎统计信息。

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| CF_API_KEY | - | API 认证密钥 |
| SESSION_TTL | 7200 | 会话 TTL（秒） |
| REQUEST_TIMEOUT | 90 | 请求超时（秒） |
| MAX_RETRIES | 3 | 最大重试次数 |
| JS_INTERPRETER | js2py | JS 解释器 (js2py/nodejs) |
| LOG_LEVEL | INFO | 日志级别 |

## 项目结构

```
cf-bypass-service/
├── app.py          # FastAPI 入口
├── scraper.py      # 核心引擎 (CloudScraper v3.0)
├── pyproject.toml  # 依赖配置
└── data/           # 数据文件
```

## 技术栈

- **CloudScraper v3.0** - CF 绕过核心
- **FastAPI** - Web 框架
- **js2py** - JavaScript 解释器
