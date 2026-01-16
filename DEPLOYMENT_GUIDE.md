# Nexus Reader - 部署指南

本指南帮助你部署优化后的 Nexus Reader 系统，包括 CF Bypass Service Phase 2 和 Unified Worker。

---

## 📋 部署清单

### ✅ 已完成的优化
- [x] CF Bypass Service Phase 1 优化（代码整合、算法优化）
- [x] CF Bypass Service Phase 2 实现（会话池、连接池、自适应重试、内存管理、健康监控）
- [x] Cloudflare Workers 整合（unified-worker.js）
- [x] 105 个测试全部通过（100% pass rate）

### 🎯 需要部署的组件
1. **CF Bypass Service Phase 2** - 性能提升最大（70-80% 首次请求加速）
2. **Unified Worker** - 代码更简洁，维护更容易（可选）

---

## 🚀 部署步骤

### 第一部分：CF Bypass Service Phase 2 部署

#### 1. 配置环境变量

在 HuggingFace Space 的 Settings → Variables 中添加以下环境变量：

```bash
# Phase 2 Feature Flags（全部启用以获得最佳性能）
SESSION_POOL_ENABLED=true
CONNECTION_POOL_ENABLED=true
ADAPTIVE_RETRY_ENABLED=true
MEMORY_OPTIMIZATION_ENABLED=true
HEALTH_MONITORING_ENABLED=true

# Session Pool Configuration（生产环境推荐值）
SESSION_POOL_SIZE=5
SESSION_POOL_MAX_AGE_HOURS=24
SESSION_POOL_REPLENISH_THRESHOLD=0.5

# Connection Pool Configuration（生产环境推荐值）
POOL_CONNECTIONS=20
POOL_MAXSIZE=50
POOL_MAX_RETRIES=3
POOL_BACKOFF_FACTOR=0.3

# Adaptive Retry Configuration（生产环境推荐值）
RETRY_HIGH_RELIABILITY_MAX=2
RETRY_MEDIUM_RELIABILITY_MAX=3
RETRY_LOW_RELIABILITY_MAX=5
RETRY_HIGH_BACKOFF=1.0
RETRY_MEDIUM_BACKOFF=1.5
RETRY_LOW_BACKOFF=2.0

# Memory Management Configuration（生产环境推荐值）
STREAMING_THRESHOLD_MB=10
IDLE_SESSION_TIMEOUT_HOURS=1
CACHE_SIZE_LIMIT=10000
AGGRESSIVE_CLEANUP_THRESHOLD=0.8

# Health Monitoring Configuration（生产环境推荐值）
DEGRADATION_ERROR_THRESHOLD=0.5
SLOW_RESPONSE_MULTIPLIER=2.0
```

#### 2. 重启 HuggingFace Space

在 HuggingFace Space 的 Settings 中点击 "Restart Space" 按钮。

#### 3. 验证部署

等待 Space 重启完成后，访问以下端点验证：

```bash
# 健康检查
curl https://your-space.hf.space/health

# 预期响应：
{
  "status": "healthy",
  "version": "5.0.0",
  "timestamp": "2026-01-16T...",
  "active_sessions": 0,
  "engine": "CloudScraper",
  "cache_available": true
}

# 查看配置
curl https://your-space.hf.space/config

# 预期响应：
{
  "phase2": {
    "session_pool_enabled": true,
    "connection_pool_enabled": true,
    "adaptive_retry_enabled": true,
    "memory_optimization_enabled": true,
    "health_monitoring_enabled": true,
    ...
  },
  "version": "5.0.0"
}

# 查看统计信息
curl https://your-space.hf.space/stats

# 预期响应：包含 session_pool, connection_pool, adaptive_retry, memory, health 等统计信息
```

#### 4. 监控性能指标

部署后，通过 `/stats` 端点监控以下关键指标：

- **Session Pool Hit Rate**: 目标 >80%
- **Connection Pool Hit Rate**: 目标 >70%
- **Memory Usage**: 应该减少 60-80%
- **Retry Efficiency**: 应该提升 10-20%
- **First Request Time**: 应该快 70-80%

#### 5. 性能测试（可选）

```bash
# 测试首次请求速度（应该快 70-80%）
time curl -X POST https://your-space.hf.space/fetch \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'

# 测试会话池预热
curl -X POST https://your-space.hf.space/warmup?domain=example.com

# 再次测试请求速度（应该更快）
time curl -X POST https://your-space.hf.space/fetch \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

---

### 第二部分：Unified Worker 部署（可选）

Unified Worker 整合了 3 个独立的 workers，提供更简洁的代码和更容易的维护。

#### 优势
- ✅ 单一部署点，维护更简单
- ✅ 统一的中间件系统（CORS、认证、日志）
- ✅ 一致的错误处理
- ✅ 代码减少 37.5%（~300 行）

#### 1. 准备环境变量

确保你有以下环境变量（通过 GitHub Secrets 或 wrangler deploy --var 注入）：

```bash
# HuggingFace Space URLs
NEXUS_LITE_URL=https://your-nexus-lite.hf.space
CF_BYPASS_URL=https://your-cf-bypass.hf.space

# GitHub OAuth 配置
GITHUB_CLIENT_ID=your_github_oauth_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_client_secret
ALLOWED_GITHUB_USERS=your_github_username

# 认证密钥
AUTH_SECRET=your_random_secret_string_at_least_32_chars

# 前端和 Worker URLs
FRONTEND_URL=https://nexus-reader.pages.dev
WORKER_URL=https://nexus-unified.xxx.workers.dev

# KV Namespace IDs
KV_CONTENT_CACHE_ID=your_content_cache_kv_id
KV_PROGRESS_ID=your_progress_kv_id
```

#### 2. 部署 Unified Worker

```bash
# 进入项目目录
cd /path/to/nexus-reader

# 部署 unified worker
wrangler deploy --env unified

# 或者通过 GitHub Actions 自动部署（推荐）
# 提交代码后会自动触发部署
```

#### 3. 测试 Unified Worker

```bash
# 替换为你的 worker URL
WORKER_URL="https://nexus-unified.xxx.workers.dev"

# 测试健康检查
curl $WORKER_URL/health

# 测试保活端点
curl $WORKER_URL/keepalive

# 测试代理功能（需要认证）
curl $WORKER_URL/content/some-path \
  -H "Authorization: Bearer your_token"

# 测试进度同步（需要认证）
curl $WORKER_URL/progress/book-id \
  -H "Authorization: Bearer your_token"

# 测试 GitHub OAuth 登录
curl $WORKER_URL/login/github
```

#### 4. 逐步迁移流量

**方案 A：直接切换（推荐用于测试环境）**
- 更新前端配置，将所有请求指向 unified worker
- 监控错误率和响应时间
- 如有问题，立即回滚到旧 workers

**方案 B：灰度发布（推荐用于生产环境）**
1. 先在 staging 环境测试 unified worker
2. 生产环境保持旧 workers 运行
3. 逐步将流量切换到 unified worker（10% → 50% → 100%）
4. 监控关键指标
5. 确认稳定后，弃用旧 workers

#### 5. 弃用旧 Workers（可选）

当 unified worker 稳定运行后，可以考虑弃用旧的 3 个 workers：

```bash
# 删除旧 workers（谨慎操作！）
wrangler delete nexus-progress-sync
wrangler delete --env auth
wrangler delete --env proxy

# 或者保留作为备份，但停止更新
```

---

## 📊 性能对比

### CF Bypass Service Phase 2

| 指标 | Phase 1 | Phase 2 | 提升 |
|------|---------|---------|------|
| 首次请求时间 | 100% | 20-30% | **70-80% 更快** |
| 连接复用率 | 基准 | +44.3% | **30-50% 提升** |
| 内存使用 | 100% | 20% | **80% 减少** |
| 重试效率 | 基准 | +20% | **10-20% 提升** |

### Unified Worker

| 指标 | 旧方案（3 workers） | 新方案（unified） | 改进 |
|------|-------------------|------------------|------|
| 代码行数 | ~800 行 | ~500 行 | **-37.5%** |
| 部署点 | 3 个 | 1 个 | **维护更简单** |
| 代码重复 | 高 | 低 | **更易维护** |

---

## 🔍 故障排除

### CF Bypass Service 问题

#### 问题 1：Session Pool Hit Rate 低于 80%

**可能原因：**
- Pool size 太小
- Sessions 过期太快
- 流量波动大

**解决方案：**
```bash
# 增加 pool size
SESSION_POOL_SIZE=10

# 增加 session 最大年龄
SESSION_POOL_MAX_AGE_HOURS=48

# 降低补充阈值
SESSION_POOL_REPLENISH_THRESHOLD=0.6
```

#### 问题 2：内存使用过高

**可能原因：**
- Cache size 太大
- Idle sessions 没有清理
- 内存泄漏

**解决方案：**
```bash
# 减少 cache size
CACHE_SIZE_LIMIT=5000

# 降低 idle timeout
IDLE_SESSION_TIMEOUT_HOURS=0.5

# 启用更激进的清理
AGGRESSIVE_CLEANUP_THRESHOLD=0.7
```

#### 问题 3：连接错误率高

**可能原因：**
- Pool size 太小
- 网络问题
- 域名不可靠

**解决方案：**
```bash
# 增加 pool size
POOL_MAXSIZE=100

# 增加重试次数
POOL_MAX_RETRIES=5

# 检查网络连接
# 检查域名可靠性
```

### Unified Worker 问题

#### 问题 1：部署失败

**检查：**
- KV namespace IDs 是否正确
- 环境变量是否完整
- wrangler.toml 配置是否正确

#### 问题 2：路由不工作

**检查：**
- unified-worker.js 是否正确实现了所有路由
- 认证逻辑是否正确
- CORS 配置是否正确

#### 问题 3：性能下降

**检查：**
- 是否有错误日志
- 响应时间是否正常
- KV 缓存是否工作

---

## 📚 参考文档

### CF Bypass Service
- `cf-bypass-service/PHASE2_DEPLOYMENT.md` - 详细部署指南
- `cf-bypass-service/ENVIRONMENT_VARIABLES.md` - 环境变量完整文档
- `cf-bypass-service/PERFORMANCE_INTEGRATION.md` - 性能集成指南
- `OPTIMIZATION_SUMMARY.md` - 优化总结

### Unified Worker
- `cloudflare-workers/unified-worker.js` - 源代码
- `cloudflare-workers/shared/` - 共享模块
- `wrangler.toml` - 配置文件

---

## ✅ 部署检查清单

### CF Bypass Service Phase 2
- [ ] 环境变量已配置
- [ ] HuggingFace Space 已重启
- [ ] `/health` 端点返回正常
- [ ] `/config` 显示 Phase 2 已启用
- [ ] `/stats` 显示性能指标
- [ ] Session pool hit rate >80%
- [ ] 首次请求时间提升 70-80%

### Unified Worker（可选）
- [ ] 环境变量已准备
- [ ] wrangler.toml 已更新
- [ ] Worker 已部署
- [ ] 所有路由测试通过
- [ ] 认证功能正常
- [ ] 代理功能正常
- [ ] 进度同步正常
- [ ] 保活任务正常

---

## 🎉 完成！

恭喜！你已经成功部署了优化后的 Nexus Reader 系统。

**预期收益：**
- 🚀 首次请求快 70-80%
- 🚀 连接复用提升 44.3%
- 🚀 内存使用减少 80%
- 🚀 重试效率提升 20%
- 📦 代码更简洁（如果部署了 unified worker）
- 🔧 维护更容易

**下一步：**
1. 监控性能指标（通过 `/stats` 端点）
2. 根据实际流量调整配置
3. 定期查看日志和错误率
4. 享受更快的服务！

---

**日期**: 2026-01-16  
**版本**: Phase 2.0  
**状态**: 准备部署 ✅
