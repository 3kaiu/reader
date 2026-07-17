# AI Decoder — 小说语境解码与智能替换系统

> **状态**: `planned` · **优先级**: P1 · **依赖**: nexus-server, nexus-storage, web reader UX
> **审计日期**: 2026-07-17 · **审计方法**: 对抗审计 (aggressive adversarial review)

---

## 1. 为什么

### 1.1 问题

阅读中文键政/架空/历史小说时，读者频繁遇到：

| 现象 | 例子 | 阅读体验影响 |
|---|---|---|
| 人物代指/别名 | "拜振华"、"懂王"、"长者" | 不知道指谁，需要断读搜索 |
| 虚构地名映射 | "梁家河"、"西山"、"白区" | 不理解地理/派系背景 |
| 隐喻事件 | "那次会议"、"某件事" | 不知道在影射什么历史事件 |
| 跨章别名不一致 | 第3章叫"老赵"，第12章叫"赵董" | 以为是不同角色 |
| 网络梗/行话 | 特定社区的隐语 | 完全看不懂 |

### 1.2 目标

> 在 Nexus Reader 中引入 AI 语境理解层，让读者在阅读键政/架空类小说时，**无需中断阅读**即可获得人物代指、事件背景、别名解析等上下文信息。

核心约束：
- **个人使用**，不服务多用户
- **中国大陆网络环境**，部分信息可能被审查
- **NAS Docker 部署**，CPU 推理资源有限
- **M4 Mac 开发机**可用做本地推理节点

---

## 2. 关键设计决策

来自对抗审计的结论：

| 决策 | 选项 | 结论 |
|---|---|---|
| AI 介入时机 | B(行内替换) + C(随选查询) + D(侧边面板) | 三层并存，用户可配置 |
| 确认模式 | 首次弹气泡确认 → 后续同词自动替换 | 映射基准 + 视觉覆盖层 |
| 知识来源 | AI 上下文判断 + 联网验证 | 上下文优先，知识库补充 |
| 推理位置 | 混合: M4 开发机推理 → NAS 知识库只读 | NAS 不跑推理 |
| 替换方式 | **视觉覆盖层**而非修改原文 | DOM overlay / `<ruby>` 注音 |
| 映射存储 | JSON 版本化知识库 + 用户 CRUD | 可导入/导出，社区共享 |
| 隐私策略 | 纯本地推理 (M4/Ollama) | 不走云端 API |

---

## 3. 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                       Web Frontend (Vue 3)                       │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ AiAnnotator  │  │ AiQueryPop   │  │ AiContextPanel      │   │
│  │ (行内标注)    │  │ (划词气泡)    │  │ (侧边上下文面板)    │   │
│  └──────┬──────┘  └──────┬───────┘  └──────────┬───────────┘   │
│         │                │                      │               │
│  ┌──────┴────────────────┴──────────────────────┴───────────┐  │
│  │ useAiDecoder — 核心组合式函数                              │  │
│  │  - 管理映射状态 / 确认队列 / 交互生命周期                   │  │
│  │  - 对接 API 层 (/api/ai/*)                               │  │
│  └──────────────────────────┬───────────────────────────────┘  │
└─────────────────────────────┼─────────────────────────────────┘
                              │ HTTP / SSE
┌─────────────────────────────┼─────────────────────────────────┐
│                nexus-server (axum, Rust)                       │
│  ┌──────────────────────────┴──────────────────────────────┐  │
│  │ AI Routes  (nexus-server/src/routes/ai/)                 │  │
│  │                                                          │  │
│  │  POST /api/ai/decode     划词/选中文本 → 语境解码       │  │
│  │  POST /api/ai/scan       全章扫描 → 代指/事件元数据     │  │
│  │  GET  /api/ai/mapping    获取映射库                     │  │
│  │  PUT  /api/ai/mapping    用户确认/编辑映射条目           │  │
│  │  GET  /api/ai/context    获取当前章节上下文包            │  │
│  │  POST /api/ai/book-reset 重置/重新生成全书元数据         │  │
│  └──────────────────────────┬──────────────────────────────┘  │
│  ┌──────────────────────────┴──────────────────────────────┐  │
│  │ nexus-ai (new crate, works in Rust context)              │  │
│  │  - InferenceClient: HTTP 桥接 → ai-inference 服务       │  │
│  │  - KnowledgeEngine: 映射匹配 + 置信度计算               │  │
│  │  - ContextAssembler: 章节上下文打包                     │  │
│  │  - SyncClient: M4 推理结果写入 NAS 知识库               │  │
│  └──────────────────────────┬──────────────────────────────┘  │
└─────────────────────────────┼─────────────────────────────────┘
                              │ HTTP (internal network)
┌─────────────────────────────┼─────────────────────────────────┐
│               ai-inference 服务 (Python / FastAPI)             │
│                                                               │
│  开发机 (M4) / 可选 NAS (CPU only) 均可部署                    │
│                                                               │
│  ┌───────────────────────────┐  ┌──────────────────────────┐  │
│  │ Router + Prompt Engine    │  │ Model Backend            │  │
│  │  /infer    → 通用推理     │  │  MLX (macOS dev)         │  │
│  │  /decode   → 代指解析     │  │  或 llama.cpp (NAS)      │  │
│  │  /scan     → 章节扫描     │  │  或 Ollama HTTP API      │  │
│  │  /annotate → 批量标注     │  │  Model: Qwen2.5-7B-Q4    │  │
│  └───────────────────────────┘  └──────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

### 数据流

```
阅读场景 (实时):
  选中文字 → useAiDecoder → POST /api/ai/decode → nexus-ai/InferenceClient
    → ai-inference /decode → 模型推理 (上下文 + 知识)
    → 返回 { term, explanation, candidate_mappings[], confidence }
    → 前端渲染气泡/替换

批量场景 (后台, 新章节到达时):
  章节获取 → POST /api/ai/scan → nexus-ai/ContextAssembler
    → ai-inference /scan → 模型推理 (全章)
    → 返回 { aliases[], events[], entities[], confidence }
    → 存入 knowledge store → 前端读取元数据覆盖层

同步场景 (M4 开发 → NAS 部署):
  M4: 本地推理 → SyncClient → POST /api/ai/mapping (批量写入)
  NAS: 只读知识库 → 映射覆盖渲染
```

---

## 4. 模块设计

### 4.1 `api/nexus-ai/` — Rust crate (workspace member)

**位置**: `api/nexus-ai/`
**技术栈**: Rust, reqwest, serde, tokio, tracing
**依赖**: nexus-core (domain types)

```
nexus-ai/src/
├── lib.rs                     # Crate root, re-exports
├── client/
│   ├── mod.rs
│   ├── inference.rs           # InferenceService — HTTP 桥接到 ai-inference
│   ├── types.rs               # DecodeRequest, DecodeResponse, ScanResult
│   └── retry.rs               # 重试 + 熔断 (复用现有 FallbackChain 模式)
├── knowledge/
│   ├── mod.rs
│   ├── engine.rs              # KnowledgeEngine — 映射匹配 + 置信度
│   ├── store.rs               # KnowledgeStore trait (sled 实现)
│   ├── sync.rs                # SyncClient — M4→NAS 同步协议
│   └── conflict.rs            # 冲突解决 (用户确认覆盖机器推测)
├── context/
│   ├── mod.rs
│   ├── assembler.rs           # ContextAssembler — 上下文打包
│   └── window.rs              # 滑动窗口 (最近 N 章 + 摘要)
├── config.rs                  # AiConfig (推理地址, 模型选择, 映射库路径)
└── error.rs                   # AiError
```

**关键接口**:

```rust
// client/inference.rs
#[async_trait]
pub trait InferenceService: Send + Sync {
    /// 单次划词/选中查询
    async fn decode(&self, req: DecodeRequest) -> Result<DecodeResponse>;
    /// 全章扫描 (批量)
    async fn scan(&self, req: ScanRequest) -> Result<ScanResult>;
    /// 带上下文的多轮查询 (选中词 + 前后文 + 已知映射)
    async fn decode_with_context(&self, req: ContextDecodeRequest) -> Result<DecodeResponse>;
}

// knowledge/engine.rs
pub struct KnowledgeEngine {
    store: Arc<dyn KnowledgeStore>,
    inference: Arc<dyn InferenceService>,
}

impl KnowledgeEngine {
    /// 查映射库 + 填充/修正 → 返回最终建议
    pub async fn resolve(&self, term: &str, context: &ChapterContext) -> Result<ResolvedMapping>;
    /// 用户确认后固化
    pub async fn confirm(&self, mapping: UserConfirmedMapping) -> Result<()>;
}

// knowledge/store.rs
#[async_trait]
pub trait KnowledgeStore: Send + Sync {
    async fn get_mapping(&self, book: &str, term: &str) -> Option<AliasMapping>;
    async fn put_mapping(&self, mapping: AliasMapping) -> Result<()>;
    async fn get_chapter_meta(&self, book: &str, chapter: usize) -> Option<ChapterMeta>;
    async fn put_chapter_meta(&self, meta: ChapterMeta) -> Result<()>;
    async fn sync_batch(&self, batch: Vec<AliasMapping>) -> Result<SyncReceipt>;
}

// types.rs
#[derive(Serialize, Deserialize)]
pub struct DecodeRequest {
    pub book_id: String,
    pub chapter_index: usize,
    pub selected_text: String,
    pub surrounding_text: String,    // 选中词前后 ~200 字
    pub context_meta: Option<String>, // 已知映射的 JSON 上下文
}

#[derive(Serialize, Deserialize)]
pub struct DecodeResponse {
    pub term: String,
    pub explanation: Option<String>,
    pub candidate_mappings: Vec<CandidateMapping>,
    pub confidence: ConfidenceLevel,  // High / Medium / Low
}

#[derive(Serialize, Deserialize)]
pub struct AliasMapping {
    pub id: String,                    // UUID
    pub book_id: String,
    pub alias: String,                 // "拜振华"
    pub canonical: String,             // "Joe Biden"
    pub category: MappingCategory,     // Person | Place | Event | Faction | Meme
    pub confidence: f32,               // 0.0 ~ 1.0
    pub source: MappingSource,         // Ai | User | Community
    pub confirmed: bool,               // 用户已确认
    pub context_clues: Vec<String>,    // 推理依据 "第三章提到签署通胀削减法案"
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub confirmed_at: Option<chrono::DateTime<chrono::Utc>>,
    pub version: u32,
}
```

### 4.2 `ai-inference/` — Python FastAPI 推理服务

**位置**: `ai-inference/` (与 `bypass/` 同级)
**技术栈**: Python 3.11+, FastAPI, Pydantic, ollama (HTTP client), uv
**可替换后端**: MLX (macOS dev), llama.cpp (NAS CPU), Ollama (both)

```
ai-inference/
├── pyproject.toml
├── Dockerfile
├── main.py                     # FastAPI app entry
├── core/
│   ├── __init__.py
│   ├── router.py               # Routes
│   ├── schemas.py              # Pydantic request/response models
│   ├── config.py               # InferenceConfig
│   └── types.py                # Domain types
├── engines/
│   ├── __init__.py
│   ├── base.py                 # BaseInferenceEngine (ABC)
│   ├── ollama.py               # Ollama HTTP backend
│   ├── mlx.py                  # MLX local backend (macOS dev)
│   └── factory.py              # Engine factory
├── pipelines/
│   ├── __init__.py
│   ├── decode.py               # 划词解码管线
│   ├── scan.py                 # 全章扫描管线
│   ├── alias.py                # 代指提取 + 消歧
│   └── context.py              # 上下文组装
├── prompts/
│   ├── __init__.py
│   ├── decode.py               # 划词解码 prompt 模板
│   ├── scan.py                 # 全章扫描 prompt 模板
│   ├── alias.py                # 代指提取 prompt 模板
│   └── system.py               # 系统 prompt (角色设定 + 约束)
├── knowledge/
│   ├── __init__.py
│   ├── cache.py                # 内存 LRU 映射缓存
│   └── adapter.py              # 通过 nexus-server API 读写映射库
└── tests/
    └── test_pipelines.py
```

**Prompt 设计原则**:

```
[System]
你是一个小说语境解码助手。你的任务是帮助读者理解小说中的代指、别名、隐喻。
规则：
1. 基于给定的小说文本上下文推断，不要依赖外部知识
2. 如果无法从上下文中确定，标注"推测"并说明依据
3. 区分"确定性代指"（文本内有直接证据）和"推测性代指"（基于常见映射模式）
4. 对政治敏感内容做事实性陈述，不做价值判断
5. 输出严格 JSON 格式，不要多余内容

[User]
小说: 《XXX》
当前章节: 第 12 章
前情摘要: [AI 维护的滚动摘要]

选中文本: "拜振华"
上下文: "...拜振华签署了《通胀削减法案》，宣布对华加征关税..."

已知映射: {"长者": "江泽民", "梁家河": "习近平知青点"}

请推断"拜振华"指谁。
```

### 4.3 Frontend — Vue 3 组件

**位置**: `web/src/components/ai/`
**技术栈**: Vue 3, Tailwind CSS 4, Reka UI, lucide-vue-next

```
web/src/components/ai/
├── AiAnnotator.vue              # 行内标注组件 (替换/高亮/下划线)
├── AiQueryPopup.vue             # 划词气泡弹出
├── AiContextPanel.vue           # 侧边上下文面板
├── AiMappingEditor.vue          # 映射库管理界面 (CRUD)
├── AiConfiguration.vue          # AI 设置 (模型选择/API 地址/映射库来源)
├── AiConfirmBubble.vue          # 首次确认气泡
├── AiInlineMarker.vue           # 已知映射的视觉标记 (虚线 / 颜色标识)
└── composables/
    ├── useAiDecoder.ts           # 核心组合式函数
    ├── useAiMapping.ts           # 映射 CRUD 操作
    ├── useAiContext.ts           # 上下文状态管理
    └── types.ts                  # 组件级类型定义
```

#### `useAiDecoder` 核心逻辑:

```typescript
// 状态管理
const mappingStore = ref<Map<string, AliasMapping>>()  // 当前书的已知映射
const confirmationQueue = ref<PendingMapping[]>()       // 待确认列表
const chapterContext = ref<ChapterContext>()             // 当前章节上下文

// 核心交互流程
async function handleTextSelect(selection: Selection) {
  // 1. 检查映射缓存
  const cached = mappingStore.value.get(selection.text)
  if (cached?.confirmed) {
    // 已确认 → 直接渲染覆盖
    return renderOverlay(selection, cached)
  }

  // 2. 调用解码 API
  const result = await api.decode({
    bookId, chapterIndex,
    selectedText: selection.text,
    surroundingText: getSurrounding(selection),
  })

  if (result.confidence === 'High' && result.candidate_mappings.length === 1) {
    // 高置信度 → 显示确认气泡, 确认后自动渲染
    showConfirmBubble(selection, result)
  } else {
    // 低置信度 / 多候选 → 弹出选择面板
    showChoicePanel(selection, result)
  }
}

// 视觉覆盖层
function renderOverlay(range: Range, mapping: AliasMapping) {
  // 使用 CSS 覆盖: 原文保留, 覆盖层显示规范名
  // 视觉: "<ruby>拜振华<rt>Biden</rt></ruby>"
  // 或: "拜振华" 右上角小标 "Biden"
  // 悬停显示完整映射卡片
}
```

### 4.4 API Routes — `nexus-server/src/routes/ai/`

```rust
// routes/ai/mod.rs
pub fn ai_routes() -> Router<AppState> {
    Router::new()
        .route("/api/ai/decode", post(handler::decode))
        .route("/api/ai/scan", post(handler::scan))
        .route("/api/ai/mapping", get(handler::list_mappings))
        .route("/api/ai/mapping", put(handler::upsert_mapping))
        .route("/api/ai/context", get(handler::chapter_context))
        .route("/api/ai/book-reset", post(handler::reset_book))
}
```

### 4.5 知识存储

复用 `nexus-storage` 的 sled 层，扩展：

```
nexus-storage/src/
├── ... (existing)
└── ai/
    ├── mod.rs
    ├── alias_store.rs    # AliasStore: sled tree "ai:alias:{book_id}"
    ├── meta_store.rs     # ChapterMetaStore: sled tree "ai:meta:{book_id}"
    └── sync_log.rs       # SyncLogStore: sled tree "ai:sync:log"
```

**数据模型**:

```rust
// sled key 设计
// "ai:alias:{book_id}:{alias_normalized}" → JSON(AliasMapping)
// "ai:meta:{book_id}:{chapter_index}"    → JSON(ChapterMeta)
// "ai:sync:log:{timestamp}"              → JSON(SyncLogEntry)
```

---

## 5. 实现路线图

### V1 — 划词查询 (预计 2 周)

**范围**: 最小可用系统，不做替换只做查询

| 任务 | 模块 | 工时 |
|---|---|---|
| 1.1 创建 `ai-inference/` 服务框架 + Dockerfile | Python | 1d |
| 1.2 实现 `/decode` 端点 + Ollama backend | Python | 2d |
| 1.3 编写划词解码 prompt 模板 | Python | 1d |
| 1.4 创建 `nexus-ai/` crate + 基础类型 | Rust | 1d |
| 1.5 实现 InferenceClient (HTTP 桥接) | Rust | 1d |
| 1.6 实现 AI routes (decode) + 集成到 server | Rust | 1d |
| 1.7 前端 AiQueryPopup + useAiDecoder | Vue/TS | 2d |
| 1.8 AiContextPanel (侧边面板) | Vue/TS | 1d |
| 1.9 联调 + 端到端测试 | all | 2d |

**V1 交付物**:
- 阅读器选中文本 → 气泡显示 AI 解释
- 侧边面板显示当前章节已知映射列表
- M4 本地推理 (Ollama + Qwen2.5-7B)
- NAS 部署可关掉 AI (退化到无 AI 状态)

### V2 — 映射知识库 (V1 + 2 周)

| 任务 | 模块 | 工时 |
|---|---|---|
| 2.1 KnowledgeStore (sled 实现) | Rust | 2d |
| 2.2 KnowledgeEngine (映射匹配 + 置信度) | Rust | 2d |
| 2.3 映射 CRUD routes + AiMappingEditor | Rust + Vue | 2d |
| 2.4 `/scan` 端点 + 全章扫描管线 | Python + Rust | 2d |
| 2.5 ContextAssembler (滚动摘要) | Rust | 1d |
| 2.6 首次确认气泡 (AiConfirmBubble) | Vue | 1d |
| 2.7 已知映射视觉标记 (AiInlineMarker) | Vue | 1d |
| 2.8 映射导入/导出 JSON | Rust + Vue | 1d |

**V2 交付物**:
- 代指映射持久化，跨会话生效
- 全章扫描自动提取代指/事件
- 首次出现弹气泡确认，后续自动标记
- 映射编辑器 (CRUD + 导入/导出)
- 映射库可社区共享 (JSON 文件)

### V3 — 自动替换与同步 (V2 + 2 周)

| 任务 | 模块 | 工时 |
|---|---|---|
| 3.1 视觉覆盖层渲染 (overlay / ruby) | Vue | 2d |
| 3.2 SyncClient (M4→NAS 同步协议) | Rust | 2d |
| 3.3 冲突解决 + 版本管理 | Rust | 1d |
| 3.4 MLX backend (macOS 开发机加速) | Python | 1d |
| 3.5 AiConfiguration 设置页 | Vue | 1d |
| 3.6 docker-compose 集成 | YAML | 1d |
| 3.7 端到端集成测试 | all | 2d |

**V3 交付物**:
- 高置信度映射行内自动替换 (视觉覆盖)
- M4 推理 → NAS 知识库同步
- 完整设置页面 (模型选择/映射源/替换开关)
- Docker 一键部署

---

## 6. 技术栈决议

| 层 | 选择 | 备选 | 理由 |
|---|---|---|---|
| AI 推理 | Python (FastAPI) | Rust (candle/burn) | 迭代速度快，ML 生态成熟 |
| 模型后端 | Ollama HTTP | MLX / llama.cpp | 统一接口，切换无感 |
| 模型 | Qwen2.5-7B-Q4 | DeepSeek-R1-Distill-Qwen-7B | 中文能力最强 7B |
| 推理硬件 | M4 (MLX, 开发) / CPU (Ollama, NAS) | — | 现有硬件零成本 |
| 映射存储 | sled (复用现有) | SQLite / JSON file | 与现有存储层一致 |
| 前端标注 | Vue 3 + CSS overlay | <ruby> / SVG overlay | DOM 不动原文 |
| 前端 UI | Reka UI + Tailwind | — | 与现有设计系统一致 |
| 同步协议 | HTTP REST (JSON) | WebSocket / gRPC | 简单可靠，无需额外依赖 |

---

## 7. 集成点

### 7.1 与现有 Nexus 模块的关系

| 现有模块 | 集成方式 | V1 | V2 | V3 |
|---|---|---|---|---|
| `nexus-server` | 添加 AI routes | ✅ | ✅ | ✅ |
| `nexus-storage` | 扩展 sled tree | ❌ | ✅ | ✅ |
| `nexus-engine` | 可选: 内容提取后自动触发 scan | ❌ | ❌ | ⏳ |
| `bypass/` | 无直接关系 | — | — | — |
| `edge/` | 无直接关系 | — | — | — |
| `web/ reader` | 菜单 + 选中交互 + 侧边栏 | ✅ | ✅ | ✅ |
| `contracts/` | 添加 AI 路由策略 | ❌ | ✅ | ✅ |

### 7.2 配置 (`config.json` 扩展)

```json
{
  "ai": {
    "enabled": false,
    "inference_url": "http://localhost:8001",
    "model": "qwen2.5-7b-q4",
    "max_context_chapters": 5,
    "auto_scan_on_fetch": false,
    "knowledge_dir": "/app/data/ai-knowledge"
  }
}
```

---

## 8. 风险和缓解

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| 小模型 (7B) 代指推测准确率低 | 中 | 高 | 置信度分级；用上下文+知识库补偿；用户确认机制兜底 |
| 审查: 本地模型拒答政治内容 | 中 | 高 | 提前测试 Qwen2.5 的审查边界；备选 DeepSeek-v2 (更开放) 或 Llama-3.1 (无审查但中文弱) |
| NAS CPU 推理太慢无法实用 | 高 | 中 | V1 不做 NAS 推理；M4 推理 → 知识库同步；NAS 只读 |
| 替换破坏原文语境 | 低 | 低 | 视觉覆盖层不动 DOM；一键还原；关掉替换模式 |
| 映射库膨胀 (500 章小说) | 中 | 低 | sled 前缀扫描 + 按 book_id 分树；千条映射 < 1MB |
| 跨章同号异人误替换 | 低 | 中 | 章节窗口上下文消除；仅高置信度自动替换 |

---

## 9. 目录总览 (创建后)

```
reader/
├── PLANS/
│   └── ai-decoder.md                    ← 本文档
├── ai-inference/                         ← 新: Python 推理服务
│   ├── pyproject.toml
│   ├── Dockerfile
│   ├── main.py
│   ├── core/
│   ├── engines/
│   ├── pipelines/
│   └── prompts/
├── api/
│   ├── nexus-ai/                         ← 新: Rust AI crate
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── client/
│   │       ├── knowledge/
│   │       ├── context/
│   │       ├── config.rs
│   │       └── error.rs
│   ├── nexus-storage/src/ai/             ← 扩展: AI 存储
│   ├── nexus-server/src/routes/ai/       ← 扩展: AI 路由
│   └── Cargo.toml                        ← 修改: 添加 nexus-ai member
├── web/src/
│   └── components/ai/                    ← 新: AI 前端组件
│       ├── AiAnnotator.vue
│       ├── AiQueryPopup.vue
│       ├── AiContextPanel.vue
│       ├── AiMappingEditor.vue
│       ├── AiConfirmBubble.vue
│       ├── AiInlineMarker.vue
│       ├── AiConfiguration.vue
│       └── composables/
└── docker-compose.yml                    ← 修改: 添加 ai-inference 服务
```

---

## 10. 验证标准

### V1 验收
- [ ] 阅读器中选中任意文本 → 弹出 AI 解释气泡
- [ ] 侧边面板显示当前章节的已知代指/事件
- [ ] M4 本地推理延迟 < 5 秒
- [ ] NAS 部署不带 AI 时完全退化为现有功能
- [ ] 前后端所有测试通过
- [ ] `cargo check --workspace` 通过

### V2 验收
- [ ] 用户确认的映射跨会话持久化
- [ ] 全章扫描自动提取代指 → 知识库
- [ ] 首次代指弹气泡 → 确认后自动标记
- [ ] 映射编辑器 CRUD + 导入/导出 JSON
- [ ] 映射库可通过 GitHub 分享

### V3 验收
- [ ] 高置信度映射行内视觉覆盖（不影响原文）
- [ ] M4 推理 → NAS 知识库增量同步
- [ ] 10 本 500 章小说的压力测试
- [ ] Docker Compose 一键部署起服
