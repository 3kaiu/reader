# 当前项目架构精简改造方案

## 1. 结论

当前仓库不是一个“单一阅读系统”，而是以下 4 套系统并存：

1. `nexus-reader`：前端阅读器
2. `nexus-lite`：Rust 后端，承担书源、搜索、正文抓取、清洗、缓存、书架
3. `cf-bypass-service`：抓取增强服务，负责 Cloudflare/反爬绕过
4. `cloudflare-workers`：边缘代理、认证、同步、decoder、用户附属能力

从业务主线看，真正决定成败的是这条链路：

`书源定义 -> 搜索 -> 目录 -> 正文抓取 -> 文本清洗 -> 章节缓存 -> 前端阅读`

围绕这条主链路，当前项目的主要问题不是“功能太少”，而是：

- 主链路周围存在过多兼容层、统一层、实验层、平台化抽象
- 前后端已经出现真实的接口漂移
- 部分模块名义上是“统一”，实际是第二套实现
- 可选能力进入了正文热路径，影响复杂度和稳定性

因此，建议的方向不是继续拆更多服务，而是：

**先收敛核心系统，再把 AI、decoder、edge、auth、同步等能力降级为可选附属模块。**

---

## 2. 当前真实核心与非核心

### 2.1 真正的核心

以下模块直接服务于“抓正文并阅读”：

- `nexus-lite/nexus-engine`
- `nexus-lite/nexus-storage`
- `nexus-lite/nexus-server` 中的以下接口：
  - `/api/search`
  - `/api/book`
  - `/api/chapters`
  - `/api/content`
  - `/api/bookshelf`
  - `/api/groups`
  - `/api/replace_rules`
- `nexus-reader` 中的以下旅程：
  - 搜索
  - 阅读
  - 书架
  - 书源管理
  - 替换规则

### 2.2 当前的附属能力

这些能力有价值，但不应与核心链路等权演进：

- `cloudflare-workers` 中的认证、进度同步、备份、客户端指标
- `cloudflare-workers` 中的 decoder
- `nexus-lite` 中的 AI 映射规则、语音元数据、发现页
- `nexus-reader` 中的 AI 面板、角色图谱、decoder 词典、语音设置
- `cf-bypass-service` 中的高级性能/健康/内存/连接池优化体系

### 2.3 当前的主要冗余

#### 前端冗余

- `src/api/book.ts`、`src/api/source.ts`、`src/api/group.ts`、`src/api/replace.ts`
- `src/api/unified.ts`
- `src/stores/unified.ts`
- `src/utils/unified-utils.ts`

它们都在做“统一/兼容/聚合”，但没有形成单一可信入口。

#### 后端冗余

- `nexus_core::parse_cache` 与 `nexus_storage::ChapterCache`
- `event_bus.rs` 与 `event_bus_new.rs`
- `nexus_core` 内的 `domain/application/infrastructure/presentation/cross_cutting/optimizer`
- `HttpFetcher` 已初始化，但主抓取路径主要通过 `CfBypassStrategy`

#### 服务层冗余

- `cf-bypass-service` 作为一个 HTML 获取服务，却同时承载大量 Phase2 管理器和优化器
- `cloudflare-workers` 同时扮演反向代理、用户服务、decoder 服务、认证入口

---

## 3. 目标架构

目标不是“更高级”，而是“更稳定、更少分叉、更少错配”。

### 3.1 目标分层

#### Core A：`reader-web`

职责：

- 搜索书
- 打开书
- 拉目录
- 拉正文
- 展示阅读器
- 保存书架和阅读进度
- 管理书源和替换规则

要求：

- 每个用户旅程只允许一套 API 封装
- 每个页面只依赖一个真实 store
- 不再保留“统一 API/统一 store”的兼容壳

#### Core B：`reader-api`

职责：

- 装载书源定义
- 执行搜索
- 拉书籍信息和目录
- 获取正文并清洗
- 做章节缓存
- 做书架/分组/规则存储

要求：

- 按业务域收敛为 3 个模块：
  - `catalog`
  - `library`
  - `infra`

#### Optional C：`fetch-provider`

即 `cf-bypass-service`。

职责：

- 只负责“给我 HTML”
- 支持可选引擎：`scraper` / `mesh`

要求：

- 从核心业务视角，它是一个“可选抓取增强器”
- 不再作为正文抓取的默认单点

#### Optional D：`edge-addon`

即 `cloudflare-workers`。

职责：

- auth
- progress sync
- backup
- decoder
- edge proxy

要求：

- 不再与阅读主链路混在一起叙述
- 在部署和文档上明确标记为“附属系统”

---

## 4. 目标目录边界

### 4.1 前端目标

建议最终收敛为：

```text
nexus-reader/src/
  api/
    client.ts
    search.ts
    reader.ts
    library.ts
    source.ts
    replace.ts
  stores/
    search.ts
    reader.ts
    library.ts
    source.ts
    settings.ts
  pages/
    index.vue
    search.vue
    reader.vue
    sources.vue
    replace-rule.vue
    settings.vue
  features/
    decoder/      # 可选
    ai/           # 可选
    voice/        # 可选
    sync/         # 可选
```

### 4.2 Rust 后端目标

建议最终收敛为：

```text
nexus-lite/
  nexus-server/
    src/
      main.rs
      app.rs
      routes/
        health.rs
        catalog.rs
        library.rs
        source.rs
  nexus-engine/
    src/
      source/
      fetch/
      parse/
      clean/
  nexus-storage/
    src/
      source_store.rs
      library_store.rs
      chapter_cache.rs
  nexus-core/
    src/
      config.rs
      error.rs
      types.rs
      nxs.rs
      health_tracker.rs
```

### 4.3 可选服务目标

#### `cf-bypass-service`

建议暴露最小接口：

- `GET /health`
- `POST /fetch`

可保留：

- `scraper`
- `mesh`

可延后处理或弱化：

- 高阶优化配置
- 大量独立 manager 的显式存在感

#### `cloudflare-workers`

建议按附属能力拆清文档：

- `edge-proxy`
- `auth`
- `sync`
- `decoder`

---

## 5. 明确建议：哪些保留，哪些冻结，哪些删除

## 5.1 `nexus-reader`

### 保留

- `src/pages/index.vue`
- `src/pages/search.vue`
- `src/pages/reader.vue`
- `src/pages/sources.vue`
- `src/pages/replace-rule.vue`
- `src/pages/settings.vue`
- 真正命中后端的 API 文件
- 真正参与阅读链路的组件

### 冻结

- `decoder-dictionary`
- `ai-settings`
- `ai-analysis-settings`
- `voice-settings`
- `statistics`
- discovery 页如果当前不是核心目标，也建议先降级为附属

冻结含义：

- 不继续扩写
- 先从主路由和主流程里弱化存在感
- 后续等核心链路稳定后再决定是否恢复

### 删除或合并

- `src/api/unified.ts`
- `src/stores/unified.ts`
- `src/utils/unified-utils.ts` 中和真实运行链路重复的 API/配置/缓存封装
- 所有调用不存在接口的页面逻辑
- 所有与当前后端未闭环的“源订阅/换源搜索/伪 WebSocket 搜索”逻辑

### 前端原则

1. 一个页面只依赖一套 API
2. 一个旅程只依赖一个 store
3. 页面不再直接猜测后端能力
4. 不再保留“未来可能用到”的兼容 facade

---

## 5.2 `nexus-lite`

### 保留

- `nexus-engine` 的 NXS 引擎能力
- `SourceStore`
- `SledStore`
- `ChapterCache`
- `EngineRegistry`
- `SearchOrchestrator`
- 现有图书搜索/目录/正文/书架/规则接口

### 冻结

- `nexus-core` 中整套 DDD/application/presentation/infrastructure
- `optimizer`
- `workflow_optimizer`
- `algorithm_optimizer`
- `event_bus_new`

冻结含义：

- 不再作为默认扩展入口
- 不再给新功能接线
- 后续移入 `experimental` 或独立 crate

### 删除或收编

- `parse_cache` 初始化，如果与运行中的 `ChapterCache` 职责重复
- `HttpFetcher` 如果不进入正文主链路，可先移除运行时注入
- `EventBus` 如果只用于启动广播，可从主 AppState 去掉
- 将 AI/voice/discovery 路由降级为 addon route group

### Rust 后端原则

1. 只保留正文主链路必需抽象
2. 不让“平台型抽象”主导目录结构
3. 配置、类型、错误、引擎协议保留在核心
4. 业务热路径优先于通用框架美观

---

## 5.3 `cf-bypass-service`

### 保留

- `main.py`
- `core/engine.py`
- `core/engine_factory.py`
- `engines/scraper.py`
- `engines/mesh.py`

### 收敛

- 把该服务重新定义为“抓取增强器”，不是“抓取平台”
- Phase2 优化器和 manager 先保留实现，但不要继续外扩概念面
- 对外文档只描述：
  - 接口
  - 引擎
  - 何时启用
  - 失败时如何回退

### 建议后续处理

- 中期把 managers 折叠回 engine 内部实现细节
- 外部只保留抓取 SLA 与统计输出，不暴露内部优化体系语义

---

## 5.4 `cloudflare-workers`

### 保留

- 作为边缘能力存在
- 代理后端
- 用户认证
- 进度同步
- decoder

### 收敛

- 从“核心阅读系统架构图”中降级为外挂层
- 不再让前端默认依赖 edge 才能阅读
- 优先保证直接连接 `nexus-lite` 也能完整工作

### 原则

- edge 是增强，不是唯一入口
- 核心阅读功能必须可绕过 edge 单独跑通

---

## 6. 分阶段改造计划

## Phase 0：止血和对齐

目标：让系统重新回到“接口一致、构建可验证”的状态。

### 要做的事

1. 前端把 `type-check` 从 `tsc` 改为 `vue-tsc`
2. 修复当前构建错误
3. 删掉或 feature-flag 掉调用不存在接口的页面逻辑
4. 明确当前对外支持的 API 契约
5. 给前后端加一份最小接口清单

### 验收标准

- `nexus-reader` 可以构建
- `nexus-lite` 可以 `cargo check`
- 搜索、打开书、拉目录、拉正文、加入书架能跑通

### 优先级

最高

---

## Phase 1：前端收边界

目标：前端先变简单，不再一边跑一边猜。

### 要做的事

1. 删除 `api/unified.ts`
2. 删除 `stores/unified.ts`
3. 拆掉 `unified-utils.ts` 中与 API/store 冲突的统一层
4. 建立 4 个旅程模块：
   - search
   - reader
   - library
   - source
5. 清理无后端支撑的功能入口：
   - 订阅源
   - 伪换源
   - 伪 WebSocket 搜索状态

### 验收标准

- 每个页面都能追溯到唯一 API
- 每个页面都能追溯到唯一 store
- 页面不再调用不存在的方法

---

## Phase 2：后端缩核

目标：把 Rust 后端恢复成一个清晰的“阅读后端”，不是框架实验场。

### 要做的事

1. 将 `nexus-core` 缩到最小核心集
2. 把 DDD/application/presentation/infrastructure/optimizer 标记为实验层
3. 合并重复缓存路径
4. 去掉运行时未生效或无收益注入
5. 重整路由为：
   - `catalog`
   - `library`
   - `addons`

### 验收标准

- `AppState` 只保留真正运行时依赖
- 主业务链路可在 10 分钟内被新开发者解释清楚
- 不看 `nexus-core` 的实验模块也能理解系统

---

## Phase 3：抓取链路解耦

目标：把 `cf-bypass-service` 从默认单点变成可升级抓取能力。

### 要做的事

1. 抓取策略改为：
   - direct
   - bypass
   - browser
2. `cf-bypass-service` 只在需要时启用
3. 失败时允许回退
4. 将 “某站点必须走 bypass” 收敛为 source 级配置

### 验收标准

- 后端不依赖单个外部抓取服务才能启动
- 某些非强反爬站点可直连完成抓取
- 抓取失败行为可观测

---

## Phase 4：附属系统独立化

目标：保留附属价值，但不让它们干扰阅读主链路。

### 要做的事

1. `cloudflare-workers` 改为 addon 文档和部署方式
2. AI/voice/decoder/discovery 改为 feature flag
3. 从正文热路径中移出 AI mapping 拼装
4. 用户同步、备份、认证单独描述

### 验收标准

- 主系统在关闭 addon 后仍可完整阅读
- addon 的存在与否不影响正文主链路稳定性

---

## 7. 第一阶段建议立即执行的动作

这是建议你立刻开干的一批，收益最大，风险最低。

### 第一批

1. 修复 `nexus-reader` 构建失败
2. 切换到 `vue-tsc`
3. 去掉所有调用不存在接口的方法
4. 暂时隐藏或禁用以下功能入口：
   - 订阅源
   - 换源搜索
   - 未闭环 AI 对话/推荐
   - 未闭环 TTS 接口

### 第二批

1. 删除 `api/unified.ts`
2. 删除 `stores/unified.ts`
3. 清理 `unified-utils.ts` 中的重复客户端抽象
4. 让 `reader.vue` 只依赖真实 `reader store`

### 第三批

1. 精简 `AppState`
2. 收敛 `nexus-core`
3. 切分后端路由组
4. 将 AI/voice/discovery 下沉到 addon

---

## 8. 不建议做的事

以下动作当前阶段不建议做：

1. 不要继续拆更多微服务
2. 不要先重写全部前端
3. 不要先大规模重写 NXS 引擎
4. 不要把 DDD 平台层继续做深
5. 不要在核心链路未稳定前继续扩 AI/voice/decoder 页面

---

## 9. 目标状态定义

如果本次精简完成，理想状态应当是：

1. 一个新同事只看 `nexus-reader + nexus-server + nexus-engine + nexus-storage` 就能理解主系统
2. 阅读核心链路不依赖 Cloudflare Workers
3. 抓取增强服务是可选能力，不是默认单点
4. 前端页面与后端契约一致
5. 构建、类型检查、核心接口测试能稳定覆盖主链路

---

## 10. 推荐实施顺序

按投入产出比排序：

1. 前端止血：构建、类型检查、接口漂移修复
2. 前端去统一层：API/store 收边界
3. 后端去平台化：缩 `nexus-core`
4. 抓取链路解耦：`cf-bypass-service` 降为可选增强
5. addon 独立化：workers、AI、voice、decoder、sync

---

## 11. 最终建议

这套项目的正确方向不是“继续长”，而是“先瘦下来”。

对当前业务来说，最值得投入的不是再做一层抽象，而是：

- 让正文抓取更稳定
- 让清洗规则更可靠
- 让章节缓存更有效
- 让前后端契约重新一致
- 让系统边界重新可解释

一句话概括：

**把项目从“多系统拼装平台”收敛回“以阅读为核心、附属能力可插拔”的产品架构。**
