# Nexus Reader 前端 UI 深度研究报告

> 研究日期: 2026-07-12
> 参考目标: 69书吧沉浸式滚动阅读器 (微信读书风格 Userscript)
> 研究方法: 全量代码审查 (626 源文件) + 参考脚本逐行分析 (1385 行)

---

## 目录

1. [整体架构概览](#一整体架构概览)
2. [设计系统分析](#二设计系统分析)
3. [各页面 UI 详解](#三各页面-ui-详解)
4. [阅读器页面深度分析](#四阅读器页面深度分析)
5. [参考 Userscript 完整分析](#五参考-userscript-完整分析)
6. [差距分析矩阵](#六差距分析矩阵)
7. [优化建议与实施路径](#七优化建议与实施路径)
8. [技术债务与架构改进](#八技术债务与架构改进)

---

## 一、整体架构概览

Nexus Reader 是一个 **Vue 3 + TypeScript + Rsbuild + Tailwind CSS 4 + Pinia** 的单页应用，采用 hash 路由 (`createWebHashHistory`)。

### 1.1 代码规模

```
web/src/ — 626 源文件
├── pages/          (6 页面组件)
├── components/     (~160 组件: 132 reader + 28 通用/业务)
├── composables/    (~113 composable: 53 reader + 60 通用/业务)
├── stores/         (7 领域: library/reader/search/settings/source/replace/offline)
├── styles/         (1 文件: main.css)
├── api/            (HTTP 客户端层)
├── services/       (离线缓存、内容处理、同步管理)
├── utils/          (42 工具模块)
├── types/          (9 类型定义)
└── tests/          (31 测试文件)
```

### 1.2 路由与页面

| 路由 | 页面 | 预加载策略 | 主要组件 |
|------|------|-----------|----------|
| `#/` | 书架首页 | webpackPreload | BookshelfHeaderBar + BookshelfContent |
| `#/reader` | 沉浸式阅读器 | webpackPrefetch | ReaderExperience (Toolbar+Content+Modals) |
| `#/search` | 搜索 | webpackPrefetch | SearchHeroState + SearchResultsPanel |
| `#/sources` | 书源管理 | webpackPrefetch | PageHeader + Tabs + SourceListCard 网格 |
| `#/replace-rule` | 替换规则 | webpackPrefetch | PageHeader + ReplaceRuleCard 网格 |
| `#/settings` | 设置 | webpackPrefetch | PageHeader + SettingsContent |

### 1.3 页面转场

`App.vue` 中 `<Transition name="page-slide" mode="out-in">`:
- **进入**: `opacity: 0; translateX(20px) scale(0.99)` → 正常
- **离开**: 正常 → `opacity: 0; translateX(-20px) scale(1.01)`
- **时长**: `0.5s cubic-bezier(0.23, 1, 0.32, 1)`

### 1.4 架构分层

阅读器采用严格的 **Service → Feature → Model → Binding → Component** 五层架构:

```
pages/reader.vue
  → useReaderView() composable
    → view-services     (Pinia stores + useEyeCare + useReaderSession)
    → view-layout       (readerRef + 响应式布局)
    → view-features     (scrollSync + readerChrome + readerActions)
    → view-models       (readerPageState/Actions + readerExperienceState/Actions)
      → ReaderExperienceLayout
        ├── ReaderToolbar (bindings → ToolbarPanels → TopBar/BottomBar)
        ├── ReaderContent (bindings → ContentViewport → ScrollContent)
        └── ReaderModals  (bindings → ModalsPanels → 5 overlays)
```

---

## 二、设计系统分析

### 2.1 颜色系统 (shadcn HSL 风格)

```css
/* 亮色主题 */
--theme-background: 0 0% 100%;           /* 纯白 */
--theme-foreground: 222.2 84% 4.9%;      /* 近黑 */
--theme-primary: 222.2 47.4% 11.2%;      /* 深灰蓝 */
--theme-secondary: 210 40% 96.1%;        /* 浅灰 */
--theme-muted: 210 40% 96.1%;            /* 浅灰 */
--theme-border: 214.3 31.8% 91.4%;       /* 极浅灰 */

/* 暗色主题 (.dark) */
--theme-background: 222.2 84% 4.9%;      /* 深蓝黑 */
--theme-foreground: 210 40% 98%;         /* 近白 */
--theme-primary: 210 40% 98%;
```

12 个语义色 token (background, foreground, card, popover, primary, secondary, muted, accent, destructive, border, input, ring)，各带 foreground 变体。

### 2.2 阴影系统 (6 层)

| Token | 用途 | 亮色模式 | 暗色模式强度 |
|-------|------|---------|------------|
| `shadow-sm` | 微妙 lift | `rgba(0,0,0,0.04)` | `rgba(0,0,0,0.4)` |
| `shadow-md` | 卡片 hover | 多层 `0.04–0.08` | `0.4–0.6` |
| `shadow-lg` | 模态框 | 多层 `0.06–0.1` | `0.6–0.8` |
| `shadow-xl` | 深层弹窗 | `0.08–0.12` | `0.9` |
| `shadow-premium` | 阅读器工具栏 | 精细多层 | 精细深色多层 |
| `shadow-inner` | 内阴影 | `rgba(0,0,0,0.05)` | `rgba(0,0,0,0.5)` |

### 2.3 玻璃拟态

```css
/* 亮色 */
--glass-bg: rgba(255, 255, 255, 0.65);
--glass-border: rgba(255, 255, 255, 0.3);
--glass-reflection: inset 0 1px 1px 0 rgba(255, 255, 255, 0.4);

/* 暗色 */
--glass-bg: rgba(12, 12, 14, 0.6);
--glass-border: rgba(255, 255, 255, 0.06);
--glass-reflection: inset 0 1px 1px 0 rgba(255, 255, 255, 0.03);
```

### 2.4 排版系统

**系统字体栈**: `-apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei"`

启用 OpenType 特性: `"cv02", "cv05", "cv11", "ss01"` (Inter 字体优化)

**阅读器定制字体**: 霞鹜文楷 (LXGW WenKai Screen) 通过 CDN (`cdn.jsdelivr.net`) 加载

### 2.5 动效系统

| 动画名称 | 时长 | 缓动函数 | 用途 |
|----------|------|----------|------|
| `page-slide` | 500ms | `cubic-bezier(0.23,1,0.32,1)` | 页面转场 |
| `slide-down` | 300ms | `ease-out` | 顶部工具栏显隐 |
| `slide-up` | 300ms | `ease-out` | 底部工具栏显隐 |
| `animate-spring` | 可配 | `cubic-bezier(0.34,1.56,0.64,1)` | 弹性弹入 |
| `animate-soft` | 可配 | `cubic-bezier(0.4,0,0.2,1)` | 柔和过渡 |
| `zoom-in-95` | 150ms | ease | 模态弹入 |
| `fade` | 300ms | ease | 覆盖层淡入淡出 |
| `accordion` | 200ms | ease-out | 折叠面板 |

### 2.6 无障碍

| 特性 | 实现 |
|------|------|
| `prefers-reduced-motion` | 全局禁用动效 (`0.01ms`) |
| 触摸目标 | `≥ 44px` (`@media (pointer: coarse)`) |
| 焦点样式 | `ring-2 ring-ring ring-offset-2` |
| iOS 安全区 | `env(safe-area-inset-*)` 全局支持 |
| ARIA | 主题/字体选择按钮上的 `aria-label`/`aria-pressed` |
| 暗色模式 | `.dark` class + CSS 变量反转 |

---

## 三、各页面 UI 详解

### 3.1 书架首页 (`pages/index.vue`)

**背景装饰**: 两个大型模糊光晕
- `.bg-primary/5 rounded-full blur-[120px]` (左上, 40vw)
- `.bg-blue-500/5 rounded-full blur-[100px]` (右上, 30vw)
- `fixed inset-0 pointer-events-none -z-10`

**头部栏** (`BookshelfHeaderBar.vue`):
- `fixed` 定位, `pointer-events-none`, 子元素 `pointer-events-auto`
- 左侧: Library 图标 + "阅读" 标题
- 右侧: 日/夜切换 (Sun/Moon), 搜索按钮, 管理/完成按钮, 菜单面板触发 (Settings 图标)

**菜单面板** (`BookshelfMenuPanel.vue`):
- 桌面: DropdownMenuContent (`w-72 rounded-xl bg-popover/95 backdrop-blur-xl shadow-xl`)
- 移动端: SheetContent 底部弹出 (`rounded-t-[20px] bg-background/95 backdrop-blur-xl`)
- 菜单项: 彩色图标容器 (`bg-{color}-500/10 text-{color}-500`) + 标签 + 描述

**分组标签** (`BookshelfGroupTabs.vue`):
- 水平可滚动 `overflow-x-auto scrollbar-hide`
- 激活: `bg-primary text-primary-foreground shadow-md`
- 未激活: `bg-muted/50 text-muted-foreground`
- `rounded-full px-4 py-1.5`

**书籍网格**: 响应式 3/4/5/6 列 (sm/md/lg/xl)

**书籍卡片** (`BookCard.vue`):
- `aspect-[2/3] rounded-xl interactive group shadow-premium`
- Hover: `shadow-[0_8px_30px_rgba(0,0,0,0.12)]`
- 选中: `ring-2 ring-primary`
- 子组件: BookCardMedia (封面图 LazyImage), BookCardStatusOverlays (未读计数/缓存指示/进度条), BookCardMenu (悬停三点菜单), BookCardMeta (标题/作者/进度)

**管理栏** (`BookshelfManageBar.vue`):
- `fixed bottom-8` (移动端) / `lg:top-24 lg:left-1/2 lg:-translate-x-1/2`
- `bg-foreground/95 backdrop-blur-2xl text-background rounded-2xl sm:rounded-full`
- `shadow-[0_20px_50px_rgba(0,0,0,0.3)]`
- `animate-in slide-in-from-bottom-4 fade-in`

### 3.2 搜索页 (`pages/search.vue`)

**英雄状态** (`SearchHeroState.vue`):
- 居中布局，`animate-in fade-in zoom-in-95 duration-500`
- 搜索框: `bg-secondary/50 border-0` (hero 变体), autofocus
- 搜索历史: `rounded-full bg-secondary hover:bg-secondary/80` 芯片
- 书源过滤: 水平可滚动芯片，选中 `bg-primary text-primary-foreground`
- "返回书架" ghost 按钮

**结果面板** (`SearchResultsPanel.vue`):
- 粘性搜索栏: `backdrop-blur-sm bg-background/90 shadow-lg`
- 结果头部: loading 动画 + 结果计数 + 错误计数 + 停止按钮
- 诊断面板 (可折叠 details): 请求 ID, package ID, 阶段耗时网格
- 结果网格: 1/2/3/4 列响应式
- 空状态: "无搜索结果" + 重置/返回按钮

**搜索结果卡片** (`SearchResultCard.vue`):
- `bg-card rounded-2xl border border-border/40`
- Hover: `hover:border-border hover:shadow-md hover:bg-muted/30`
- Active: `active:scale-[0.98]`
- 左侧: LazyImage 封面 (失败回退 BookMarked 图标)
- 右侧: 标题 (`.line-clamp-2 group-hover:text-primary`), 元信息徽章, 操作按钮
- 打开中: `bg-background/80 backdrop-blur-sm` + Loader2 旋转

### 3.3 书源/替换规则/设置页

三页共享模式:
- `PageHeader` 通用头部 (返回 + 搜索 + 操作按钮)
- `ManageModeBar` 固定底部管理栏 (弹簧动画 + 毛玻璃)
- Sheet 模态框 (ImportSource, EditSource, ImportRule, EditRule)

**PageHeader** (`components/common/PageHeader.vue`):
- 水平 flex: 返回按钮 (可选) + 搜索框 (`.max-w-md rounded-full bg-secondary/50 border-0`) + 操作按钮组
- 操作按钮支持 `hideLabelOnMobile`

**ManageModeBar** (`components/common/ManageModeBar.vue`):
- `fixed bottom-6 left-1/2 -translate-x-1/2 z-50`
- `bg-background/95 backdrop-blur-xl border shadow-2xl rounded-full`
- 弹簧入场: `cubic-bezier(0.34, 1.56, 0.64, 1)`, scale 0.9→1
- 全选按钮 + 分隔线 + 已选计数 + 自定义操作 + 删除按钮 (destructive red) + 关闭

---

## 四、阅读器页面深度分析

### 4.1 组件树

```
ReaderExperience
├── ReaderToolbar
│   ├── ReaderToolbarTopBar (fixed top, Transition: slide-down)
│   │   └── ReaderToolbarTopBarContent
│   │       ├── [返回] ← ArrowLeft (w-10 h-10 rounded-full)
│   │       ├── [书名 + 章节名] 居中
│   │       └── [目录] [全屏] (w-10 h-10 rounded-full)
│   └── ReaderToolbarBottomBar (fixed bottom, Transition: slide-up)
│       └── ReaderToolbarBottomPanel
│           ├── ReaderNavigation (上/下一章 + 进度)
│           ├── ReaderProgress (3px 水平进度条)
│           ├── [诊断信息] (可折叠 details/summary)
│           └── ReaderToolbarBottomActions (6 按钮 grid 2×3)
├── ReaderContent
│   └── ReaderContentViewport
│       ├── ReaderScrollContent (mx-auto px-6 pb-40 pt-20)
│       │   ├── ReaderScrollChapterList
│       │   │   └── ReaderScrollChapter[] (虚拟滚动, content-visibility)
│       │   │       ├── 章节标记: 徽章 + 标题 + 装饰线
│       │   │       └── 正文: <article> + v-html 渲染
│       │   └── ReaderScrollLoadState (底部分页)
│       │       ├── Loading: Loader2 旋转 + "加载中..."
│       │       ├── Finished: "恭喜，已读完全书"
│       │       └── Error: 错误卡片 + 重试/手动加载按钮
│       └── ReaderFullscreenTime (fixed top-right, 全屏时钟)
└── ReaderModals
    ├── ChapterList (左侧 Sheet w-[320px] sm:w-[400px])
    ├── ReadSettings (右侧 Sheet w-[380px] sm:w-[420px])
    ├── BookSourcePicker (底部 Sheet)
    ├── BookInfoModal (书籍详情 Sheet h-[85vh])
    └── ReaderKeyboardHelpOverlay (居中 Dialog)
```

### 4.2 阅读器主题

| 主题 | 背景色 | 文字色 | 风格 |
|------|--------|--------|------|
| `theme-white` | `#ffffff` | `#37352f` | Notion 风格纯白 |
| `theme-paper` | `#f7f6f3` | `#37352f` | Notion 风格米白 |
| `theme-night` | `#191919` | `rgba(255,255,255,0.81)` | Linear 风格暗黑 |

主题切换: `transition-colors duration-500`

### 4.3 正文排版 (CSS)

```css
.content-paragraph {
  text-indent: 2em;
  word-break: break-word;
  letter-spacing: 0.05em;
  text-align: justify;
  line-height: var(--p-line-height, 2.0);
  margin-bottom: var(--p-spacing, 1.6em);
}

.chapter-title::after {
  width: 60px; height: 2px;
  background: linear-gradient(90deg, transparent, currentColor, transparent);
  opacity: 0.3;
}
```

CSS 变量:
- `--p-line-height`: 1.2–3 (默认 2.0)
- `--p-spacing`: 0.5–3em (默认 1.6em)
- `--chapter-intrinsic-size`: 1200px (content-visibility 估算)

### 4.4 工具栏

**玻璃拟态 CSS** (`reader-toolbar.css`):
```css
.reader-toolbar-glass {
  background: rgb(var(--background-rgb));
  border: 1px solid rgba(var(--foreground-rgb), 0.08);
}
```

**自动隐藏**: 4 秒定时器 (设置/目录面板打开时不隐藏)

**底部操作按钮** (6 个, 2 行 × 3 列 grid):
1. 日/夜切换 (Sun/Moon)
2. 护眼模式 (Eye, `text-green-500` active + indicator dot)
3. 设置 (Type icon)
4. 刷新 (RotateCcw)
5. 书源 (ArrowLeftRight, 内容问题时 amber 指示)
6. 禅模式 (Settings icon, `text-primary`)

### 4.5 设置面板

**Sheet**: 右侧弹出, `w-[380px] sm:w-[420px]`, `overflow-y-auto`

**分区** (space-y-8):

**A. 阅读主题** — 3 色块按钮:
- `w-14 h-14 rounded-xl border-2 transition-all hover:scale-105 active:scale-95`
- 选中: `border-primary scale-105 shadow-md`

**B. 排版设置**:
- 正文字体: 选项按钮 (`px-4 py-2 rounded-lg border`)
  - 选中: `border-primary bg-primary/10 text-primary`
  - 未选中: `border-border hover:border-primary/50`
- 简繁转换: 同上, 不换行
- 字号: 滑块 + 减/加按钮 (`h-9 w-9`)
- 字重: `flex gap-2`, 按钮 `flex-1 py-2 rounded-lg border`
- 行高: 滑块 + 减/加按钮
- 段落间距: 滑块
- 页面宽度: 滑块

**C. 行为设置**:
- 自动夜间模式: 自定义 Switch + 时间范围显示

### 4.6 键盘快捷键

| 按键 | 功能 |
|------|------|
| `←/↑` | 上一章 |
| `→/↓/Space` | 下一章 |
| `F` | 全屏 |
| `C` | 目录 |
| `S` | 设置 |
| `D` | 日/夜模式 |
| `Z` | 禅模式 |
| `I` | 人物洞察 |
| `Esc` | 返回/关闭 |
| `?/H` | 快捷键帮助 |

### 4.7 性能优化

| 技术 | 位置 | 说明 |
|------|------|------|
| **虚拟滚动** | `@tanstack/vue-virtual` `useWindowVirtualizer` | 超过 20 章启用 |
| **content-visibility** | `reader-content.css` | `auto; contain-intrinsic-size: 1200px` |
| **ResizeObserver** | `ReaderScrollChapterList.vue` | 实时测量章节高度 |
| **IntersectionObserver** | `useReaderScrollSync.ts` | 章节索引同步 + 200px 预加载 |
| **Screen Wake Lock** | `useReaderScrollSync.ts` | 阅读时保持屏幕常亮 |
| **字体加载监听** | `document.fonts.ready` + 事件 | 清除缓存高度并重新测量 |
| **滚动节流** | rAF + idle task | 用户输入时延迟测量 |
| **性能模式** | `balanced/aggressive/compat` | 控制虚拟滚动阈值和 overscan |

---

## 五、参考 Userscript 完整分析

**来源**: `/Users/seeu/optimized-69shuba-reader.user.js` (1385 行)
**描述**: 微信读书风格沉浸式阅读 — color-mix 精简 token、prerender 策略优化、scroll-driven 进度条

### 5.1 设计 Token 系统

**3 个完整主题**，每个包含 ~40 个设计 token:

| Token 类别 | 示例值 (浅纸绿) | 用途 |
|-----------|---------------|------|
| 背景 | `#edf1e7` | 页面背景 |
| 面板 | `rgba(250,248,243,0.86)` | 毛玻璃面板 |
| 文字 | `#1c2e24` / `#1f3328` | 标题/正文 |
| 弱化文字 | `#4d6358` / `#5a6e64` / `#6e8077` | muted/faint/placeholder |
| 边框 | `rgba(100,140,118,0.15)` / `rgba(95,143,120,0.45)` | 默认/焦点 |
| 强调色 | `#5c8e76` | accent |
| 阴影 | 4 级 (xs/sm/md/lg) | 层次深度 |
| 面板变体 | strong/soft/hover/elevated | 多种面板状态 |
| 氛围 | glow/top/side/bottom, wash/top/mid/low | 渐变光晕 |
| 纹理 | grainSide, grainTint, grainTintLow | SVG 噪声叠加 |
| 进度 | progressBar, progressBg, progressDone | 进度条颜色 |
| 选择 | selection | 文本选中 |
| 按钮 | buttonBg, cardBg, ripple | 交互元素 |

**color-mix() 精简**: ~30 个衍生 token 通过 CSS `color-mix(in oklab, ...)` 动态计算，减少 JS `setProperty()` 调用。

### 5.2 字体系统

| 字体 | 来源 | Family |
|------|------|--------|
| 系统默认 | 系统 | `-apple-system, BlinkMacSystemFont, ...` |
| 宋体 | 系统 | `"Songti SC", "Noto Serif CJK SC", ...` |
| 霞鹜文楷 | CDN | `"LXGW WenKai", ...` |
| 楷体 | 系统 | `"Kaiti SC", "STKaiti", ...` |

### 5.3 UI Chrome

**顶部栏** (`.ir-topbar`):
- 玻璃拟态 + 居中定位
- 章节标题 (`.ir-chapter`) + 阅读时间芯片 (`.ir-chip--time`) + 设置入口 (`.ir-chip--action`)
- 滚动下滑隐藏 (translateY(-24px)), 上滑显示
- 设置面板打开时 elevation 提升 (`.has()` 选择器)

**底部栏** (`.ir-bottombar`):
- 上一章 / 目录 / 下一章 按钮 + 进度百分比
- 按钮有 SVG 图标 + 涟漪动画
- 玻璃拟态 + 弹簧入场 (`@starting-style`)

**设置面板** (`.ir-settings`):
- 主题卡片: 3 列 grid, 色块预览 + 标签, 选中时发光边框
- 字体卡片: 4 列 grid, 真实字体渲染预览
- 4 个滑块: 字号(16-40), 宽度(520-1200), 行距(1.5-2.8), 段间距(0.8-2.0)
- 快捷键网格 (kbd + 描述)

**回顶部 FAB** (`.ir-fab`):
- 玻璃拟态圆形按钮
- 滚动 >500px 显示, 弹簧动画
- hover 时上移 + 变色

### 5.4 氛围系统

**径向渐变光晕** (3 层):
```css
background:
  radial-gradient(ellipse at 14% -4%, var(--ir-glow-top), transparent 28%),
  radial-gradient(ellipse at 82% 8%, var(--ir-glow-side), transparent 22%),
  radial-gradient(ellipse at 50% 100%, var(--ir-glow-bottom), transparent 36%),
  linear-gradient(180deg, var(--ir-wash-top), var(--ir-wash-mid) 30%, ...);
```

**SVG 纸张纹理** (feTurbulence):
```xml
<filter id="ir-grain">
  <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3"/>
  <feColorMatrix type="saturate" values="0"/>
  <feComponentTransfer>
    <feFuncA type="linear" slope="0.04"/>
  </feComponentTransfer>
</filter>
```

### 5.5 进度系统

**水平进度条** (`.ir-progress`):
- `position: fixed; top: 0; height: 2px`
- Chrome/Safari: `animation-timeline: scroll(root)` — GPU 合成, 零主线程
- Firefox: JS fallback via rAF

**垂直进度条** (`.ir-progress-vert`):
- `position: fixed; right: 0; width: 3px`
- 同样使用 scroll-timeline + JS fallback

**剩余阅读时间**:
- 初始估算: `字数 ÷ 400`
- 实时更新: `阅读时间 × (1 - 进度%)`
- 显示在顶部栏芯片中

### 5.6 交互

| 交互 | 实现 |
|------|------|
| **单击正文** | 切换工具栏显隐 |
| **滚动方向** | 下滑隐藏工具栏, 上滑显示 (600ms 冷却) |
| **键盘** | Space 翻页, J/K 滚动, [ ] 章节, T 主题, Esc |
| **触摸滑动** | 左右滑动翻章 (>60px 水平位移) |
| **涟漪动画** | `::after` 伪元素 + 透明度过渡 |
| **章节预加载** | Speculation Rules API (Chromium prerender) + fetch 预热 (Safari/Firefox) |

### 5.7 现代 CSS 特性

| 特性 | 用途 | 基线 |
|------|------|------|
| `@property` | 12 个颜色属性注册，实现平滑主题过渡 | Chrome 85+ |
| `@layer immersive-reader` | 隔离层，无需 `!important` | 广泛支持 |
| `@starting-style` | 面板/按钮首次渲染入场动画 | Chrome 117+ |
| `color-mix(in oklab, ...)` | ~30 衍生 token 动态计算 | Chrome 111+ |
| `animation-timeline: scroll()` | GPU 合成进度条 | Chrome 115+ |
| `content-visibility: auto` | 跳过离屏段落渲染 | Chrome 85+ |
| `text-autospace: ideograph-alpha` | CJK 自动间距 | Chrome 121+ |
| `scrollbar-gutter: stable` | 防止滚动条出现时内容抖动 | Chrome 130+ |
| `overscroll-behavior-y: contain` | 阻止橡皮筋效果链式传递 | 2018+ |
| View Transitions API | 主题切换交叉淡入淡出 | Chrome 111+ |
| Speculation Rules API | 下一章完整预渲染 | Chrome 121+ |

### 5.8 无障碍

| 特性 | 实现 |
|------|------|
| `prefers-reduced-motion` | 禁用所有动效 (`.01ms`) |
| `forced-colors: active` | Windows 高对比度模式适配 |
| `@media print` | 隐藏 UI, 白色背景, 黑色文字 |
| `:focus-visible` | 2px 焦点环 |
| 语义 HTML | `<article>`, `<header>`, `<footer>`, `<main>`, `<aside>` |

---

## 六、差距分析矩阵

### 6.1 核心体验差距

| 维度 | 当前 Nexus Reader | 参考 Userscript | 差距评级 |
|------|-------------------|----------------|----------|
| **主题深度** | 3 种简单颜色，无 token 体系 | 3 主题 × 40+ tokens，完整 oklch 体系 | 🔴 大 |
| **氛围感** | 无背景纹理/光晕 | SVG 噪声纹理 + 多层 radial 渐变 | 🔴 大 |
| **进度条** | 3px 水平 JS 驱动 | 水平+垂直 scroll-timeline GPU 驱动 | 🟡 中 |
| **工具栏交互** | 4s 定时器 + 单击切换 | 滚动方向驱动 + 单击切换 | 🟡 中 |
| **阅读时间** | 无 | 估算 + 实时剩余时间 | 🔴 大 |
| **章节预加载** | IntersectionObserver 触发 | Speculation Rules + fetch 预热 | 🟡 中 |
| **主题切换** | CSS transition-colors 500ms | View Transitions API | 🟡 中 |
| **章节完标记** | 无 | 装饰线 + "本章完" | 🟢 小 |
| **回顶部 FAB** | 无 | 弹性动画 + 玻璃拟态 | 🟡 中 |
| **涟漪动画** | 无 | `::after` + 透明度过渡 | 🟢 小 |
| **键盘快捷键** | F/C/S/D/Z/Esc/? | Space翻页/JK滚动/[]章节/T主题 | 🟡 中 |
| **暗色感知** | 手动切换 | 首次加载自动检测 `prefers-color-scheme` | 🟢 小 |
| **打印样式** | 无 | 完整 @media print | 🟢 小 |
| **forced-colors** | 无 | Windows 高对比度适配 | 🟢 小 |
| **scrollbar-gutter** | 无 | stable 防止内容抖动 | 🟢 小 |

### 6.2 架构优势对比

| 维度 | 当前 Nexus Reader | 参考 Userscript |
|------|-------------------|----------------|
| **组件化** | ✅ 高度组件化，清晰分层 | ❌ 单一脚本，DOM 操作 |
| **状态管理** | ✅ Pinia + 持久化 | ⚠️ 简单 localStorage |
| **类型安全** | ✅ TypeScript 全覆盖 | ❌ 无类型 |
| **测试** | ✅ 31 测试文件 | ❌ 无测试 |
| **离线支持** | ✅ Service Worker + IndexedDB | ❌ 无 |
| **虚拟滚动** | ✅ @tanstack/vue-virtual | ✅ content-visibility: auto |
| **多书源** | ✅ 书源管理 + 搜索 + 替换规则 | ❌ 仅单站 |
| **可扩展性** | ✅ 插件式架构 | ❌ 硬编码 |
| **设计系统** | ✅ shadcn/Tailwind 4 token | ✅ 自建 oklch token |

---

## 七、优化建议与实施路径

### Phase 1: 设计系统升级 (优先级: P0)

**目标**: 将阅读器的 3 个简单主题升级为完整的 oklch 设计 token 体系

**具体任务**:
1. **定义完整 token 集** (~40 tokens × 3 themes):
   - 核心颜色: bg, panel, text, textBody, muted, faint, placeholder
   - 边框: border, borderFocus
   - 强调: accent, accentSoft, accentGlow
   - 阴影: shadowXs/Sm/Md/Lg
   - 面板变体: panelStrong/Soft/Hover/Elevated/Alt
   - 表面: surfaceStroke, selection
   - 进度: progressBar/Bg/Done
   - 按钮/卡片: buttonBg, cardBg, ripple
   - 氛围: glowTop/Side/Bottom, washTop/Mid/Low
   - 纹理: grainSide, grainTint, grainTintLow
   - 标题/分隔线: headingColor, dividerColor

2. **实现 color-mix() 衍生系统**:
   ```css
   @supports (color: color-mix(in oklab, red, blue)) {
     :root {
       --ir-panel-alt: color-mix(in oklab, var(--ir-bg) 92%, var(--ir-text) 8%);
       --ir-accent-soft: color-mix(in oklab, var(--ir-accent) 12%, transparent);
       /* ... ~30 more derived tokens */
     }
   }
   ```
   将 JS `setProperty()` 调用从 ~50 次减少到 ~15 次核心 token。

3. **升级主题切换为 View Transitions API**:
   ```ts
   if (document.startViewTransition) {
     document.startViewTransition(() => applyThemeVars())
   } else {
     applyThemeVars()
   }
   ```

### Phase 2: 核心阅读体验 (优先级: P0)

**目标**: 提升阅读沉浸感和视觉品质

4. **添加阅读氛围层**:
   - 3 层 radial 渐变光晕 (`.ir-body::before`)
   - SVG feTurbulence 纸张纹理 (`.ir-body::after`)
   - 每主题独立的氛围颜色

5. **scroll-timeline 进度条**:
   - 水平 2px 顶部进度条 (`.ir-progress`)
   - 垂直 3px 右侧进度条 (`.ir-progress-vert`)
   - Chrome/Safari: `animation-timeline: scroll(root)`
   - Firefox: JS rAF fallback

6. **滚动驱动工具栏**:
   - 下滑隐藏 (dY > 20, 600ms grace period)
   - 上滑显示 (dY < -12)
   - 顶部 < 30px 始终显示

7. **阅读时间系统**:
   - 初始估算: `总字数 ÷ 400`
   - 实时剩余: `阅读时间 × (1 - 进度%)`
   - 显示在顶部栏芯片中

### Phase 3: 交互增强 (优先级: P1)

8. **章节预加载**:
   - Speculation Rules API (Chromium, `eagerness: 'immediate'`)
   - fetch 缓存预热 (Safari/Firefox fallback)

9. **回顶部 FAB 按钮**:
   - `position: fixed; right: 24px; bottom: 96px`
   - 玻璃拟态 + 弹簧动画
   - 滚动 > 500px 显示

10. **涟漪动画**:
    - 按钮/卡片 `::after` 伪元素
    - `background: var(--ir-ripple); opacity: 0 → 1`

11. **键盘快捷键增强**:
    - 添加 Space 翻页, J/K 逐行滚动, [ ] 章节跳转, T 主题切换
    - 保持现有 F/C/S/D/Z/Esc

### Phase 4: 细节打磨 (优先级: P2)

12. **@starting-style 入场动画** — 面板/工具栏首次渲染时
13. **章节完标记** — 装饰线 + "本章完" 文字
14. **scrollbar-gutter: stable** — 防止内容抖动
15. **text-autospace: ideograph-alpha** — CJK 自动间距
16. **暗色模式自动检测** — `prefers-color-scheme: dark`
17. **@property 注册** — 12 个颜色属性平滑过渡
18. **打印样式** — `@media print` 隐藏 UI
19. **forced-colors 支持** — Windows 高对比度
20. **移动端断点细化** — 1180/760/400px (当前仅有 sm/md/lg/xl)

### 实施估算

| Phase | 工期 | 任务数 | 影响 |
|-------|------|--------|------|
| Phase 1: 设计系统 | 1-2 天 | 3 | 全局颜色/阴影/主题升级 |
| Phase 2: 核心体验 | 2-3 天 | 4 | 氛围层/进度条/工具栏/阅读时间 |
| Phase 3: 交互增强 | 1-2 天 | 4 | 预加载/FAB/涟漪/快捷键 |
| Phase 4: 细节打磨 | 1 天 | 9 | CSS 细节/无障碍/移动端 |
| **合计** | **5-8 天** | **20** | |

---

## 八、技术债务与架构改进

### 8.1 组件层过薄

Reader 组件的 132 个文件中，~90 个是类型/binding/emit 定义文件，Vue 组件仅 26 个。大量组件是纯代理层:
- `ReaderExperience.vue` → `ReaderExperienceLayout.vue` → 3 个子组件
- `ReaderToolbar.vue` → `ReaderToolbarPanels.vue` → 2 个子组件
- 每个绑定层都是一层额外的间接引用

**建议**: 合并过薄的代理组件，减少文件数。

### 8.2 缺少设计 Token 层

当前阅读器主题仅定义 3 个颜色变量 (`theme-white/paper/night`)，其余依赖全局 shadcn HSL token。阅读器应有独立的设计 token 体系。

### 8.3 CSS 文件分散

- `reader-content.css` (78 行)
- `reader-toolbar.css` (58 行)
- `main.css` (559 行)
- 各组件 scoped `<style>` 块

**建议**: 考虑使用 CSS `@layer` 组织阅读器样式层级。

---

## 附录 A: 关键文件索引

| 文件 | 行数 | 说明 |
|------|------|------|
| `web/src/pages/reader.vue` | 103 | 阅读器页面入口 |
| `web/src/App.vue` | 54 | 应用根组件 (Toast + 路由转场) |
| `web/src/styles/main.css` | 559 | Tailwind 4 主题 + 全局样式 |
| `web/src/components/reader/reader-content.css` | 78 | 正文排版 CSS |
| `web/src/components/reader/reader-toolbar.css` | 58 | 工具栏 CSS |
| `web/src/composables/reader/chrome-actions.ts` | 193 | 工具栏交互逻辑 |
| `web/src/composables/reader/chrome-state.ts` | 25 | 工具栏状态定义 |
| `web/src/components/reader/ReaderScrollChapterList.vue` | 317 | 虚拟滚动章节列表 |
| `web/src/components/reader/ReaderToolbarBottomPanel.vue` | 79 | 底部面板 (导航+进度+诊断+操作) |
| `web/src/components/ReadSettings.vue` | 102 | 阅读设置 Sheet |
| `web/src/stores/reader/state.ts` | 27 | 阅读器 Pinia 状态 |
| `web/src/constants/reader.ts` | 18 | 键盘快捷键定义 |
| `optimized-69shuba-reader.user.js` | 1385 | 参考 Userscript |

## 附录 B: 参考 Userscript 设计 Token 速查

```
T = {
  wechat: { bg: '#edf1e7', panel: 'rgba(250,248,243,0.86)', text: '#1c2e24', ... }  // 40 tokens
  mist:   { bg: '#ebe8e0', panel: 'rgba(246,244,238,0.86)', text: '#222e2a', ... }  // 40 tokens
  night:  { bg: '#151718', panel: 'rgba(30,33,35,0.94)',   text: '#bcc6c1', ... }  // 40 tokens
}

FONTS = {
  system: '系统默认', song: '宋体', wenkai: '霞鹜文楷', kai: '楷体'
}
```