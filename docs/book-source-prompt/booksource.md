# Nexus Reader — 书源制作 AI 提示词

> 适配自 Legado Tauri 的渐进式书源制作工作流。
> 本项目的书源是 Legado JSON 格式，使用 Rust 原生引擎执行，无需 JS/BoA 适配。

---

## 工作流概述

```
阶段 1 → 理解书源 JSON 结构
阶段 2 → 判断书源类型（小说 / 漫画 / 视频）
阶段 3 → 逐模块实现（search → bookInfo → chapters → content）
阶段 4 → 验证与调试
```

---

## 阶段 1：环境约束

本项目对接的是 **Legado JSON 书源格式**，书源用 Rust 原生执行，支持的规则类型：

| 规则类型 | 前缀 | 支持情况 |
|----------|------|----------|
| CSS 选择器 | `@css:` 或裸 CSS | ✅ 完整支持 |
| JSONPath | `@json:` | ✅ 完整支持 |
| 正则 | `@regex:` | ✅ 完整支持 |
| XPath | `@xpath:` | ❌ 未支持（社区源中占比 0%） |
| JavaScript | `@js:` / `<js>` | ⚠️ Node.js fallback（无原生 JS 引擎） |
| WebJS | `ruleContent.webJs` | ❌ 未支持 |

**书源格式**：完整的 `LegadoSource` JSON，匹配 Android 版 `BookSource` 数据类。
**存放位置**：`api/sources/legado/` 目录。
**导入方式**：`POST /api/sources/legado/import` 单条或批量导入。

---

## 阶段 2：判断书源类型

看 `ruleContent.content` 的返回内容：
- **小说**：返回纯文本，`@type` 可省略
- **漫画**：返回图片 URL 数组的 JSON 字符串，`@type` 设为 `comic`
- **视频**：返回播放地址，`@type` 设为 `video`

---

## 阶段 3：逐模块实现

### 模块 A：搜索 (Search)

Legado 书的 `searchUrl` 规则：

```json
{
  "searchUrl": "https://example.com/search?keyword={{key}}&page={{page}}",
  "ruleSearch": {
    "bookList": "@css:div.book-item",
    "name": "@css:a.title@text",
    "author": "@css:span.author@text",
    "bookUrl": "@css:a.title@href",
    "coverUrl": "@css:img@src",
    "kind": "@css:span.category@text",
    "lastChapter": "@css:a.latest@text",
    "wordCount": "@css:span.words@text",
    "updateTime": "@css:span.time@text",
    "checkKeyWord": "",
    "searchBody": "",
    "searchMethod": ""
  }
}
```

**URL 占位符**：`{{key}}` / `{key}` / `%s` — 会被搜索关键词替换。
**POST 搜索**：`"url,{\"method\":\"POST\",\"body\":\"key={{key}}\"}"`

### 模块 B：书籍信息 (BookInfo)

```json
{
  "ruleBookInfo": {
    "name": "@css:h1.bookname@text",
    "author": "@css:span.author@text",
    "coverUrl": "@css:.cover img@src",
    "intro": "@css:.intro@text",
    "kind": "@css:span.category@text",
    "lastChapter": "@css:.latest a@text",
    "wordCount": "@css:span.words@text",
    "updateTime": "@css:span.time@text",
    "tocUrl": "@css:a.catalog@href"
  }
}
```

### 模块 C：章节目录 (TOC)

```json
{
  "ruleToc": {
    "chapterList": "@css:ul.chapter-list li",
    "chapterName": "@css:a@text",
    "chapterUrl": "@css:a@href",
    "isVip": "@css:.vip@text",
    "isVolume": "@css:.volume@text",
    "updateTime": "@css:.time@text"
  }
}
```

### 模块 D：章节内容 (Content)

```json
{
  "ruleContent": {
    "content": "@css:#content@text",
    "replaceRegex": "本章未完.*?下一页|手机用户.*?阅读",
    "sourceRegex": "",
    "webJs": "",
    "imageStyle": ""
  }
}
```

**替换规则**：`replaceRegex` + `sourceRegex` 用于清洗正文噪声。

### 组合运算符

| 运算符 | 语义 | 示例 |
|--------|------|------|
| `\|\|` | 回退（首个非空） | `@css:.title@text || @css:h1@text` |
| `&&`  | 拼接（全部结果） | `@css:.intro@text && @css:.desc@text` |
| `%%`  | 合并（按 Zip） | 仅用于探索页分类 |

---

## 阶段 4：验证命令

```bash
# 搜索验证
cargo run -- search <source_id> <keyword>

# 书籍信息验证
cargo run -- book-info <source_id> <book_url>

# 章节列表验证
cargo run -- chapters <source_id> <toc_url>

# 正文验证
cargo run -- content <source_id> <chapter_url>

# 全流程测试
cargo run -- test-source <source_id> "斗破苍穹"

# 自动每日拉取
python3 scripts/daily-legado-fetch.py --auto --import-api http://localhost:8080
```

---

## 自动拉取 + 质量筛选

系统每天自动从以下社区拉取书源：

- **AOAOSTAR**：6 个合集，~5900 个有效书源
- **YCKCEO**：~5500 个书源

拉取后自动：
1. 按类型分类（webjs / js / xpath / css）
2. 去重和验证
3. 导入到 API
4. 质量追踪（`legado-quality.json`）

---

## 书源质量判断

| 等级 | 说明 | 占比 |
|------|------|------|
| ✅ CSS | 纯 CSS 选择器，完全自动执行 | ~47% |
| ⚠️ JS | 包含 `@js:` 模式，需 JS 执行 | ~53% |
| ❌ XPath | 包含 `@xpath:` 模式，不支持 | ~0% |
| ❌ WebJS | 包含 `webJs`，需浏览器 | ~0% |

---

## 最佳实践

### URL 处理

1. **相对 URL 自动补全** — `bookSourceUrl` 作为 Base URL，所有相对路径自动解析
2. **去掉 URL 中的 fragment** — `#anchor` 部分在下载前会被自动剔除
3. **URL 编码** — `searchUrl` 中的 `{{key}}` / `{key}` / `%s` 会被自动编码后替换
4. **GET 带参数** — 直接在 URL 中拼接，无需特殊处理
5. **POST 搜索** — 格式：`"url,{method:'POST',body:'searchkey={{key}}&type=all'}"`
6. **字符集检测** — POST body 支持 `charset=gbk` 等标注

### 选择器优先级

1. **优先使用 CSS 选择器** — 跨平台兼容，无需 JS。纯 CSS 书源占社区 ~47%，可完全自动化
2. **使用 `||` 回退** — 一个选择器失效时自动回退到备选：`@css:.title@text || @css:h1@text`
3. **使用 `&&` 拼接** — 需要拼接多个字段时：`@css:.intro@text && @css:.desc@text`
4. **避免 `@js:` 除非必要** — Node.js fallback 有 10s 超时和额外开销
5. **避免 XPath** — Rust 引擎不支持 `@xpath:`，此类源会被标记为不可自动执行
6. **避免 `webJs`** — 需要 WebView/浏览器环境，Nexus 不支持

### 翻页与分页（Legado 搜索）

搜索 `/search?keyword={{key}}&page={{page}}` 时引擎会自动翻页：
- `{{page}}` 占位符会被替换为页码（从 1 开始递增）
- 翻页停止条件：返回空结果 或 结果数 < 预期页大小
- `ruleSearch.searchMethod` 控制翻页方式（GET/POST）

### 正文清洗

1. **`replaceRegex`** — 正则替换，格式 `##pattern##replacement`，支持多规则 `||` 拼接
2. **`sourceRegex`** — 源级正则过滤（整页替换）
3. **自动清洗** — 引擎会自动移除零宽字符、去重重复段落
4. **噪声移除** — 自动识别并移除中文广告/导航行

### Headers 配置

`header` 字段支持三种格式：
- **JSON**：`{"User-Agent": "...", "Referer": "..."}`
- **Python dict 字面量**：`{'User-Agent': '...'}`
- **逐行 key-value**：`User-Agent: ...\nReferer: ...`

### 超时与重试

1. **`respondTime`** — 设置合适的超时（毫秒），默认 15000ms。站点慢时可调大到 30000
2. **熔断保护** — 同一书源连续 5 次失败后自动熔断 60s
3. **反爬回退链** — 直接请求 → CF Bypass 服务 → Browser Probe，逐级回退
4. **重试** — 网络超时和临时故障自动重试

### 图片处理（漫画书源）

漫画书源的图片处理钩子（Rust 原生实现，无需 JS）：
- **`prepareImage`** — 重写图片 URL、注入自定义 Headers（Referer/Origin/Cookie）
- **`processImage`** — 解码后变换：条带重组、水印移除、图像解密、样式调整
- **图片样式**：`grayscale`（灰度）、`invert`（反色）、`brightness_N`（亮度）、`contrast_N`（对比度）

### 自动拉取 + 质量筛选

系统每天自动从以下社区拉取书源：

| 来源 | 格式 | 书源数 | 说明 |
|------|------|--------|------|
| **AOAOSTAR** | JSON API | ~5,900 | 6 个分类合集，直接 GET |
| **YCKCEO** | HTML 抓取 | ~5,500 | 页面解析 + 分页爬取 |

拉取流水线（`scripts/daily-legado-fetch.py`）：
1. **下载** → 从社区 API 拉取全部书源 JSON
2. **验证** → JSON 结构校验、必填字段检查、URL 格式检查
3. **去重** → 按 `bookSourceUrl` 去重，同源多版本合并
4. **分类** → `webjs` / `js` / `xpath` / `css` 四类
5. **质量评分** → 生成 `legado-quality.json` 追踪每个书源的可用性
6. **批量导入** → 按 100 条/批 POST 到 `/api/sources/legado/import`

### 书源质量评级

| 等级 | 说明 | 占比 | 自动化 |
|------|------|------|--------|
| ✅ **CSS** | 纯 CSS 选择器 | ~47% | ✅ 完全自动 |
| ⚠️ **JS** | 含 `@js:` 模式 | ~53% | ⚠️ Node.js fallback |
| ❌ **XPath** | 含 `@xpath:` | ~0% | ❌ 不支持 |
| ❌ **WebJS** | 含 `webJs` | ~0% | ❌ 需浏览器 |

### 运行时环境变量

Nexus 服务端支持通过环境变量覆盖配置（无需修改 `config.json`）：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `HOST` | 绑定地址 | `0.0.0.0` |
| `PORT` | 绑定端口 | `8080` |
| `API_KEY` | API 认证密钥 | 无（不认证） |
| `RATE_LIMIT_PER_SECOND` | 速率限制/秒 | `20` |
| `RATE_LIMIT_BURST` | 突发容量 | `50` |
| `HTTP_TIMEOUT_SECONDS` | HTTP 请求超时 | `30` |
| `HTTP_MAX_CONCURRENT` | 最大并发请求 | `10` |
| `POOL_MAX_IDLE_PER_HOST` | 连接池每主机空闲连接 | `100` |
| `CF_SERVICE_URL` | CF Bypass 服务地址 | `http://localhost:8000` |
| `ALLOWED_ORIGINS` | CORS 允许来源（逗号分隔） | 空（允许全部） |