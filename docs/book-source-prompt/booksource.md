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

1. **优先使用 CSS 选择器** — 跨平台兼容，无需 JS
2. **使用 `||` 回退** — 一个选择器失效时自动回退到备选
3. **URL 处理** — `bookSourceUrl` 自动作为 Base URL 解析相对路径
4. **Headers** — 支持 JSON / Python dict / key-value 三种格式
5. **`respondTime`** — 设置合适的超时（毫秒），默认 15000ms