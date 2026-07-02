# Nexus Reader — 使用 AI 制作书源

## 推荐工作流

```
1. 让 AI 判断书源类型
2. 提供目标站点的搜索结果页 HTML
3. 让 AI 只写 search() 规则
4. 测试 → 修复 → 下一个模块
5. 最终全量测试
```

## 提示词模板

### 判断书源类型

```
请判断这个 URL 是小说、漫画还是视频站：
https://example.com

说明要实现哪些函数，以及 chapterContent() 的返回类型。
```

### 生成搜索规则

```
这是站点的搜索结果页 HTML 片段：
```html
<div class="book-item">
  <a class="title" href="/book/123">书名</a>
  <span class="author">作者</span>
  <img class="cover" src="/cover.jpg">
  <span class="latest">第100章</span>
</div>
```

请生成 Legado JSON 的 ruleSearch 部分。
```

### 修复规则

```
当前搜索返回空结果。
实际 HTML：
```html
<div class="item">
  <h2><a href="/novel/456">标题</a></h2>
  <p class="writer">作者名</p>
</div>
```

当前 ruleSearch：
```json
{
  "bookList": "@css:div.book-item",
  "name": "@css:a.title@text",
  "bookUrl": "@css:a.title@href",
  "author": "@css:.author@text"
}
```

请修复选择器。
```

## 推荐工具

- **Cursor / Windsurf**：打开项目目录，让 AI 读写书源文件
- **Claude Code**：直接在本目录中操作书源
- **GitHub Copilot Chat**：在 VS Code 中逐函数调试