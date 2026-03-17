# 验证 Checklist（本地 / CI / 线上）

用于回归验证 P0/P1 改造是否闭环，以及在 Edge / 自托管 / HF Spaces 三种形态下的最小可用性。

## A. 前端（nexus-reader）

- **IndexedDB stores 存在**：
  - `progress` / `syncQueue` / `offlineContent`（见 `contracts/INDEXEDDB_STORES.md`）
- **进度闭环**：
  - 保存进度 → 刷新页面 → 仍可读取本地进度
  - 断网 → 保存进度/触发同步 → 联网 → 队列自动回放成功
- **跨标签页一致性**：
  - 两个 tab 同一本书滚动 → 另一 tab 收到广播事件（BroadcastChannel）

## B. Worker（cloudflare-workers）

- **bindings 自检**：
  - 缺少 `PROGRESS_KV` 在生产配置下应报错并返回 500（避免 silent failure）
  - 缺少 `DECODER_KV/AI_CACHE_KV`：`/decode/*` 返回 503（避免运行时崩溃）
- **Progress API**（见 `contracts/PROGRESS_API.md`）：
  - `PUT /progress/:bookId` 返回 200
  - `GET /progress/:bookId` 返回 Progress JSON（含 `updatedAt`）
  - `DELETE /progress/:bookId` 返回 200
- **OAuth**：
  - `/auth/github` → GitHub 授权 → `/auth/github/callback` → 回跳前端携带 token

## C. Rust（nexus-lite）

- **限流生效**：
  - 同一 IP 高频请求应触发 429（或 governor 设定的限流响应）
- **搜索重试**：
  - 对可重试错误（Network/Timeout/RateLimited/CloudflareChallenge）应出现一次受控重试日志
- **章节缓存**：
  - 同一 `book_id/index` 二次请求命中 `ChapterCache`

## D. Python（cf-bypass-service）

- `/health` 可用
- `/fetch`：\n
  - 200 响应应写入 Redis（若可用）并带 `cached=true` 的返回（后续命中）\n
  - Redis 不可用应降级本地缓存且不崩溃\n

## E. CI（建议最低门槛）

- Rust：`cargo test` 通过
- 前端：`tsc --noEmit` 通过（或在 CI 中至少不出现新增错误）
- Worker：类型检查 + 最小路由 E2E（/api/health、/auth/verify、/progress）
- contracts：`node scripts/validate-contracts.mjs` 通过（或在子项目目录执行 `npm run contracts:validate`）

