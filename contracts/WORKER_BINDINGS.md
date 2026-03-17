# Worker bindings contract

本文件作为 Cloudflare Worker 的 **bindings / secrets / vars 单一真相**（用于避免 `wrangler.toml`、`shared/types.ts`、`unified-worker.ts` 三处漂移）。

## 必需（缺失应 fail fast）

- **AUTH**
  - `AUTH_SECRET`：HMAC token 签名密钥
  - `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` / `GITHUB_OWNER`：GitHub OAuth 与 owner 校验
  - `FRONTEND_URL` / `WORKER_URL`：回跳与 redirect_uri
- **Core storage**
  - `ANALYTICS_DB`：D1（写入 `user_events` 等）
  - `USER_PREFERENCES_DB`：D1（`user_preferences`）
  - `USER_CONTENT_R2`：R2（用户上传内容）
  - `BACKUP_R2`：R2（备份）
  - `ANALYTICS_ENGINE`：Analytics Engine（实时指标点位）
  - `ANALYTICS_QUEUE`：Queues（异步事件/任务）
- **Progress**
  - `PROGRESS_KV`：KV（OAuth state + 阅读进度备份）

## 强烈建议（缺失将降级或部分功能不可用）

- **Decoder cache**
  - `DECODER_KV`：KV（解码结果缓存）
  - `AI_CACHE_KV`：KV（AI 推理结果缓存）

## 可选

- `CF_API_KEY`：转发给 `cf-bypass-service` 的 `X-API-Key`
- `AI`：Workers AI binding（`[ai] binding = "AI"`）
- `GROQ_API_KEY` / `HF_API_KEY`：外部 AI fallback
- `CONTENT_CACHE_KV` 等：代理缓存/内容缓存（如启用）

## 代码落点（需要保持一致）

- `cloudflare-workers/shared/types.ts`：`WorkerEnv` 定义
- `cloudflare-workers/wrangler.toml`：bindings 声明
- `cloudflare-workers/unified-worker.ts`：`requireBinding(...)` 与路由功能依赖

