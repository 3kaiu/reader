# Nexus Reader 深度审计报告

**审计日期:** 2026-07-03  
**审计范围:** api/ (`nexus-core`, `nexus-engine`, `nexus-storage`, `nexus-server`), web/, edge/, bypass/, deploy/  
**审计维度:** 7 维度（架构/安全/性能/可靠性/测试/配置/代码质量）

---

## 维度一：架构 (Architecture)

### 1.1 依赖方向 ✅ — 完全正确

```
nexus-core (leaf)
    ← nexus-engine (depends on core)
    ← nexus-storage (depends on core)
    ← nexus-server (depends on core + engine + storage)
```

无循环依赖，无跨层调用。server 只通过 `nexus_engine::` 公开 re-export 消费 engine，不直接进入内部模块。

### 1.2 可见性问题

| Severity | 问题 | 位置 | 建议 |
|----------|------|------|------|
| **MEDIUM** | `pub use types::*` 星号重导出暴露了所有内部类型 | `nexus-core/src/lib.rs:21` | 改为显式重导出稳定类型 |
| LOW | `nexus-engine` 多个 `pub mod` 实为内部实现 | `lib.rs:15-39` | 缩小可见性，server 只需要的部分通过 `pub use` 暴露 |
| INFO | `library_integration_test` 在 `#[cfg(test)]` 下是 `pub mod` | `engine/src/lib.rs:30` | 改为 `mod` |
| INFO | `font_decryptor` 内部子模块 `pub mod common_mappings` 但父模块不可见 | `font_decryptor.rs:167` | 改为 `mod common_mappings` |

---

## 维度二：安全 (Security)

### 2.1 CRITICAL/HIGH 发现

| # | Severity | 问题 | 位置 | 证据 |
|---|----------|------|------|------|
| **1** | **HIGH** | 目录遍历：source ID 来自 `Path(id)` 未经消毒就用于 `PathBuf::join()` | `nexus-server/src/routes/source.rs:44` | `DELETE /api/sources/../tmp/evil` 可逃逸 `sources_dir` |
| **2** | **MEDIUM** | API key 使用 `==` 比较（非恒定时间） | `middleware.rs:34` | 泄漏 key 长度和前缀 |
| **3** | **MEDIUM** | `SearchRequest.sources` 无大小限制 | `routes/search.rs:40` | 无 `max_batch_content_urls` 式的限制 |
| **4** | **MEDIUM** | Chapter content 响应体无大小上限 | `routes/book.rs:240-310` | 恶意书源可返回多 MB 章节 |

### 2.2 其他

| Severity | 问题 | 建议 |
|----------|------|------|
| LOW | `SmartIpKeyExtractor` 无信任代理 CIDR 配置 | 文档化或添加自定义提取器 |
| LOW | 唯一 `unsafe` — `Mmap::map` 无 SIGBUS 防护文档 | 添加安全不变式注释 |
| INFO | SSRF 验证只运行在端点参数上，书源定义的 URL 绕过 | 在 source import 时验证 `book_source_url` |
| INFO | Rust 源码中无硬编码密钥 | ✅ |

### 架构 + 安全汇总

| Severity | Count |
|----------|-------|
| HIGH | 1 |
| MEDIUM | 4 |
| LOW | 3 |
| INFO | 4 |

---

## 维度三：性能 (Performance)

### 3.1 不必要的克隆（Hot Paths）

| Severity | 问题 | 位置 | 影响 |
|----------|------|------|------|
| **HIGH** | 搜索热路径中 `serde_json::Value::clone()` 和 `scraper::Html::clone()` | `legado/engine.rs:254-261,323,333` | 每次搜索触发全树克隆 |
| **MEDIUM** | `String::clone()` + `Arc::from()` 二阶段分配 | `engine.rs:291-292,364-365,603` | 可优化为 `Arc::from(x.as_str())` |
| LOW | `ctx.url.clone()` 在每个策略中被调用 | `strategies.rs:110,185,244,326` | 可用 `Arc<str>` |

### 3.2 锁竞争

| Severity | 问题 | 位置 |
|----------|------|------|
| **HIGH** | `std::sync::Mutex<Vec<u128>>` 每次成功 fetch 都锁定 — 串行化瓶颈 | `fetcher/client.rs:26,225,294,308` |
| MEDIUM | `std::sync::Mutex` + `.expect("poisoned")` 在 telemetry 中 7 处 | `skill_telemetry.rs:50,57,64,68,84,98,141` |
| MEDIUM | Legado regex cache 使用 `Mutex<LruCache>` 而非 `DashMap` | `selector/regex.rs:11` |
| ✅ | 8 个 `DashMap` 使用正确 | 各缓存模块 |

### 3.3 前端响应式

| Severity | 问题 | 位置 |
|----------|------|------|
| **MEDIUM** | `catalog`, `loadedChapters`, `progressMap` 使用 `ref()` 而非 `shallowRef()` | `reader/state.ts:12,13,22` |
| ✅ | `chapterContentCache` 和 `contentStageReports` 已用 `shallowRef` | `reader/state.ts:23-24` |

### 3.4 `spawn_blocking` 覆盖 ✅

sled_store 中 44 个数据库操作全部正确包裹在 `spawn_blocking` 中。无 `std::fs` 在异步执行器中被发现。

---

## 维度四：可靠性 (Reliability)

### 4.1 `unwrap()`/`expect()`/`panic!()` 审计

| 类别 | 数量 | 风险 |
|------|------|------|
| 测试代码（安全） | ~48 | ✅ |
| LazyLock/static 初始化（安全） | ~17 | ✅ |
| **Mutex poison panic 风险** | **9** | **⚠️ MEDIUM** |
| JSONPath 解析器 `unwrap()` | 1 | **⚠️ MEDIUM** — 用户规则可触发 panic |
| 启动配置 `expect()`（可接受） | 1 | ✅ LOW |
| `error.rs` serde `unwrap()` | 1 | LOW |

### 4.2 关键可靠性发现

| Severity | 问题 | 位置 |
|----------|------|------|
| **CRITICAL** | `node -e` 无超时 — `@js:` 无限循环会挂起进程 | `legado/selector/js.rs:83-87` |
| **HIGH** | Mutex poison 风险 — `.unwrap()` 在 fetcher 锁上 | `client.rs:225,294,308` |
| MEDIUM | `@js:` 执行返回 `Option<String>` 静默吞错误 | `js.rs:19` |
| ✅ | 38 种 `EngineError` 变体 + `is_retryable()` + `severity()` | `core/error.rs` |
| ✅ | 请求级/连接级/读取级超时全部配置 | `client.rs:43-45` |
| ✅ | 熔断器：5 次失败 → 60s 阻断 → 2 次成功关闭 | `circuit_breaker.rs` |

---

## 维度五：测试覆盖 (Testing)

### 5.1 Rust 测试

| Crate | `#[test]` 函数 | 代码行 | 测试/代码比 |
|-------|---------------|--------|------------|
| nexus-core | 2 | ~1200 | 极低 |
| nexus-engine | ~94 | ~12000 | 低 |
| nexus-storage | ~11 | ~4500 | 极低 |
| nexus-server | 3 | ~3000 | **极低** |
| **合计** | **~110** | **~20100** | **0.5%** |

### 5.2 前端测试

| 类型 | 数量 | 状态 |
|------|------|------|
| 单元测试 | 8 文件 / 65 测试 | ✅ 核心流覆盖 |
| 集成测试 | 0 | **❌ vitest 配置存在但零测试文件** |
| E2E 测试 | 1 | ⚠️ 单文件 smoke |
| 属性基测试 | 1 (557行) | ✅ errorHandler |

### 5.3 未覆盖的高风险区域

| 模块 | 文件数 | 约行数 | 风险 |
|------|--------|--------|------|
| Settings store | 12 | ~800 | HIGH |
| Library store | 9 | ~600 | HIGH |
| Replace store | 15 | ~900 | HIGH |
| Source store | 8 | ~500 | HIGH |
| Offline storage | 8 | ~600 | HIGH |
| **Vue 组件** | **100+** | **~5000** | **HIGH — 零组件测试** |
| composables | ~73 | ~3000 | HIGH — 仅 2/75 已测试 |
| API 层 | 多个 | ~1500 | HIGH |
| 服务层 | 多个 | ~500 | HIGH |

### 5.4 配置中不可达的覆盖率阈值

`vitest.integration.config.ts` 设置 70% 行/分支/函数/语句覆盖率阈值，但不存在集成测试文件。此配置会阻止没有测试的 CI 通过。

---

## 维度六：配置 (Configuration)

### 6.1 硬编码需参数化

| Severity | 值 | 位置 |
|----------|------|------|
| **HIGH** | 速率限制 20req/s, burst 50 | `app.rs:103-107` |
| **HIGH** | HTTP 连接池 10并发/10s连接/120s空闲/100主机 | `client.rs:32-50` |
| **HIGH** | `server.api_key` 无法通过环境变量覆盖 | `main.rs:56-98` |
| **HIGH** | 所有存储路径/资源限制/特性标志无法通过环境变量覆盖 | `main.rs:56-98` |
| MEDIUM | `config.json` 仅设置 3 个字段；20+ 配置字段使用静态默认值 | `config.rs` |
| MEDIUM | 16 个硬编码 UA 字符串 | `user_agents.rs` |
| MEDIUM | 中文广告/导航正则模式硬编码 | `quality_gate.rs:12-14` |

### 6.2 Docker Compose

| Severity | 问题 | 位置 |
|----------|------|------|
| **HIGH** | API 镜像使用 mutable `:latest` tag | `docker-compose.fnos.yml` |
| **HIGH** | `deploy/fnos/docker-compose.yml` 同样用 `:latest` | `deploy/fnos/docker-compose.yml` |
| MEDIUM | 两处 compose 均无 healthcheck | 所有 Docker 配置 |
| MEDIUM | bypass 容器默认 `restart: no` | `docker-compose.fnos.yml` |
| MEDIUM | bypass Dockerfile 以 root 运行 | `bypass/Dockerfile` |
| MEDIUM | 默认日志级别 `RUST_LOG` 泄漏 `debug` | `main.rs:27` |

---

## 维度七：代码质量 (Code Quality)

### 7.1 `#[allow(dead_code)]` 实例

| Severity | 问题 | 位置 |
|----------|------|------|
| **HIGH** | `ImageFormat::from_mime/from_extension/to_mime()` 3 个死方法 | `image_processing.rs:56,67,83` |
| **HIGH** | `HttpFetcher.timeout` 字段存储但不读取 | `client.rs:17` |
| MEDIUM | `ApiResult<T>` 类型别名未使用 | `error.rs:97` |
| MEDIUM | `ApiError::unauthorized()` 死构造函数 | `error.rs:67` |
| MEDIUM | `ExploreQuery.page` 未用 | `routes/explore.rs:25` |
| INFO | `ExtractedContent` 有错误的 `#[allow(dead_code)]` 标注 | `readability_wrapper.rs:52` |

### 7.2 过长函数

| Severity | 函数 | 行数 | 位置 |
|----------|------|------|------|
| **HIGH** | `remove_noise_paragraphs()` | **304** | `content_extract.rs:512` |
| **HIGH** | `parse_headers()` | **266** | `legado/engine.rs:113` |
| **HIGH** | `search()` (Legado) | **225** | `legado/engine.rs:457` |
| MEDIUM | `create_app()` | 130 | `app.rs:22` |

### 7.3 过大文件

| 文件 | 行数 |
|------|------|
| `content_extract.rs` | 1068 |
| `sled_store.rs` | 1043 |
| `legado/engine.rs` | 942 |

### 7.4 TODO/FIXME/HACK 标记

仅发现 1 个 TODO（`js.rs:57` — rquickjs），无 FIXME/HACK。代码维护纪律良好 ✅

### 7.5 克隆实现

全部 129 个 `Clone` 使用 `#[derive(Clone)]`。无手动实现 ✅

### 7.6 命名一致性

广泛使用 `#[serde(rename_all = "camelCase")]`，仅 `types/content.rs` 一处使用 `"snake_case"`（可能是有意的 API 契约）。✅

---

## 优先级行动清单

### 关键 (CRITICAL) — 立即修复

| # | 维度 | 问题 | 影响 |
|---|------|------|------|
| C1 | 可靠性 | `node -e` JS 执行无超时 — 恶意 `@js:` 可挂起进程 | 拒绝服务 |
| C2 | 测试 | 集成测试配置设 70% 阈值但零测试文件 — 阻止 CI | CI 假阴性 |

### 高 (HIGH) — 本版本应修复

| # | 维度 | 问题 |
|---|------|------|
| H1 | 安全 | Source ID 目录遍历 — `PATH` 参数可逃逸 `sources_dir` |
| H2 | 性能 | `std::sync::Mutex<Vec>` 在 fetcher 中 — 每次请求锁定 |
| H3 | 性能 | `serde_json::Value::clone()` / `Html::clone()` 在搜索热路径 |
| H4 | 配置 | 速率限制硬编码 20/s — 无法 NAS 调优 |
| H5 | 配置 | HTTP 连接池参数硬编码 |
| H6 | 配置 | `server.api_key` 无法通过环境变量配置 |
| H7 | 配置 | Docker 镜像使用 `:latest` mutable tag |
| H8 | 测试 | 100+ Vue 组件零测试，~73 composables 仅 2 个有测试 |
| H9 | 代码 | `remove_noise_paragraphs()` 304 行 — 需要拆分 |
| H10 | 代码 | `parse_headers()` 266 行内联测试 — 需要提取 |
| H11 | 代码 | `ImageFormat` 3 个死方法 |
| H12 | 代码 | `HttpFetcher.timeout` 死字段 |

### 中 (MEDIUM) — 下一版本

| # | 维度 | 问题 |
|---|------|------|
| M1 | 安全 | API key 非恒定时间比较 |
| M2 | 安全 | `SearchRequest.sources` 无大小限制 |
| M3 | 安全 | Chapter content 响应体无大小上限 |
| M4 | 性能 | `catalog`/`loadedChapters`/`progressMap` 深度响应式 -> `shallowRef` |
| M5 | 可靠性 | 9 处 Mutex poison 风险（.unwrap/.expect） |
| M6 | 可靠性 | JSONPath `chars.next().unwrap()` 用户规则触发 panic |
| M7 | 可靠性 | `@js:` 返回 `Option<String>` 静默吞错误 |
| M8 | 架构 | `pub use types::*` 应改为显式重导出 |
| M9 | 部署 | Docker compose 无 healthcheck |
| M10 | 部署 | bypass 容器 restart 策略为 no |
| M11 | 部署 | bypass 以 root 运行 |

### 低 (LOW) — 积压

- 前端集成测试配置清理（阈值与实际测试匹配）
- `SmartIpKeyExtractor` 代理信任文档化
- `mmap` 安全不变式注释
- Legado regex cache `Mutex` → `DashMap`
- 16 个硬编码 UA 字符串旋转策略
- 噪声模式参数化（中文广告/导航）
- 默认日志级别从 debug 改为 info
- `clean_text()` / `deduplicate_paragraphs()` 死导出清理（已标注 `#[allow(dead_code)]`）

---

## 总体评分

| 维度 | 评分 | 备注 |
|------|------|------|
| **架构** | ⚠️ 7/10 | pub 可见性控制不足，但依赖方向正确 |
| **安全** | ⚠️ 7/10 | 目录遍历 HIGH 风险，但 SSRF 验证存在 |
| **性能** | ⚠️ 6/10 | 锁竞争 + 热路径克隆，spawn_blocking 覆盖好 |
| **可靠性** | ⚠️ 7/10 | 超时/熔断器设计好，但 JS 执行无超时 CRITICAL |
| **测试** | 🔴 4/10 | Rust ~0.5% 测试/代码比；前端 100+ 组件零测试 |
| **配置** | ⚠️ 5/10 | 多处硬编码，Docker mutable tag |
| **代码质量** | ✅ 8/10 | 命名一致，极少 TODO，无 unsafe 滥用，清理已大幅改善 |

**关键发现：** 2 CRITICAL、12 HIGH、11 MEDIUM、7 LOW。
