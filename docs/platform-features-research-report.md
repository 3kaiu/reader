# 阅读器前端技术栈现代化评估报告

> 研究日期：2026-07-12
> 范围：HTML/CSS/JS/Vue/Rsbuild/TailwindCSS 最新特性及浏览器原生能力

---

## 一、技术栈现状

| 层级 | 当前使用 | 最新稳定版 | 差距 |
|------|---------|-----------|------|
| Vue | 3.x (Composition API) | **3.5** stable, 3.6 beta | 可升级 3.5 |
| Rsbuild/Rspack | 1.x | **2.1.5** | 大版本落后 |
| Tailwind CSS | v3 | **v4.3.2** | 大版本落后 |
| 构建插件 | PostCSS Tailwind | `@rsbuild/plugin-tailwindcss` | 有官方 v4 插件 |

---

## 二、CSS 新特性 — 可用于阅读器的能力矩阵

### 2.1 ✅ 已 Baseline Widely Available — 安全使用

| 特性 | Baseline | 用途 | 当前使用 |
|------|----------|------|---------|
| **CSS Nesting** | 2023 | 替代 SCSS/Less 嵌套，原生 CSS 写嵌套规则 | ❌ |
| **`@layer`** | 2022 | 控制样式优先级，阅读器样式可放在最低层 | ✅ (参考实现) |
| **`content-visibility`** | 2022 | 跳过屏幕外段落渲染，大章节性能提升 50%+ | ✅ |
| **`scrollbar-gutter`** | 2023 | 预留滚动条空间，防止布局偏移 | ✅ |
| **`light-dark()`** | 2024 | 一行动态日夜模式颜色，无需 `prefers-color-scheme` MQ | ❌ |
| **`text-wrap: pretty`** | 2024 | 避免段落最后一行孤字，提升排版质量 | ✅ |
| **`text-wrap: balance`** | 2024 | 标题排版平衡 | ❌ |
| **Popover API** | 2025 | 无 JS 弹出层（设置面板/目录），顶层 z-index + light-dismiss | ❌ |
| **`font-size-adjust`** | 2024 | 字体回退时保持 x-height 一致 | ❌ |

### 2.2 ⚠️ Newly Available — 渐进增强使用

| 特性 | Baseline | 用途 | 建议 |
|------|----------|------|------|
| **`text-autospace`** | 2025 Nov | CJK+拉丁字符自动间距 | `@supports` 包裹 |
| **`@starting-style`** | 2024 | 元素首次渲染/弹出时的入场动画 | `@supports` 包裹 |
| **`field-sizing: content`** | 2024 | 输入框自动适应内容大小 | `@supports` 包裹 |
| **`interpolate-size`** | 2025 | `height: auto` → 动画过渡 | `@supports` 包裹 |

### 2.3 ❌ Not Baseline — 需 fallback

| 特性 | 状态 | 用途 |
|------|------|------|
| **Scroll-Driven Animations** (`animation-timeline`, `scroll-timeline`) | Chrome 115+, Firefox flagged, Safari ❌ | 进度条、滚动驱动动效 |
| **View Transitions API** (same-document) | Chrome 111+, Firefox ❌, Safari ❌ | 主题切换交叉淡入淡出 |
| **View Transitions API** (cross-document) | Chrome only | MPA 页面过渡 |

### 2.4 关键发现：当前代码的 scroll-timeline 和 View Transitions

**当前代码** 已经使用了这两个特性但都带了 fallback：
- `reader.vue`: `@supports (animation-timeline: scroll())` + JS `--ir-vert-pct` fallback ✅
- `action-styles.ts`: `document.startViewTransition` + 直接调用 fallback ✅

**评估**：当前策略正确。短期内不需要改变。当 Firefox/Safari 支持后自动生效。

---

## 三、Vue 3.5 升级收益

### 3.1 可直接使用的新 API

| 特性 | 说明 | 阅读器场景 |
|------|------|-----------|
| **`useTemplateRef()`** | 类型安全的模板引用 | 替代 `ref="readerRef"` 字符串 ref |
| **`useId()`** | SSR 安全的唯一 ID | 工具栏按钮 ARIA label |
| **`onWatcherCleanup()`** | 声明式 watch 清理 | 滚动监听、章节预加载清理 |
| **Watch pause/resume** | 暂停/恢复 watcher | 编程式滚动时暂停位置保存 |
| **Reactive Props Destructure** | 默认启用 | 减少组件样板代码 |
| **`v-bind()` in CSS** | 响应式 CSS 变量 | 字体大小/行距/字体系列驱动排版 |

### 3.2 v-bind() in CSS 对阅读器的价值

当前 `action-styles.ts` 通过 `computed` → `contentStyle` → 组件 props → `:style` 绑定来传递排版参数。可以改为：

```vue
<script setup>
const settings = useSettingsStore()
const fontSize = computed(() => settings.config.fontSize)
const lineHeight = computed(() => settings.config.lineHeight)
</script>

<style scoped>
.reader-content {
  font-size: v-bind(fontSize + 'px');
  line-height: v-bind(lineHeight);
}
</style>
```

**收益**：减少 props 传递链条，CSS 值由 Vue 自动转为 CSS 变量并响应式更新。

### 3.3 Vue 3.6 Beta — 跟踪但不立即采用

| 特性 | 状态 | 收益 |
|------|------|------|
| **Vapor Mode** | Beta, 无 VDOM | 阅读器内容区（DOM 密集）编译后更小更快 |
| **Alien Signals** | Beta | 响应式性能提升，零代码改动 |
| **Template Tree-Shaking** | Beta | 不用的特性自动从 bundle 剔除 |

---

## 四、Tailwind CSS v4 迁移评估

### 4.1 重大变化

| v3 (当前) | v4 |
|-----------|-----|
| `tailwind.config.js` | CSS `@theme` 指令 |
| RGB 色彩空间 | **OKLCH** 色彩空间（感知均匀） |
| PostCSS 构建 | Oxide 引擎（Rust），**3.5-5× 更快** |
| 手动 `content` 配置 | 自动检测，尊重 `.gitignore` |
| 单独安装 autoprefixer | 内置 |
| 动态值受限 | `grid-cols-15`、任意值原生支持 |
| 无容器查询 | `@container` + `@md:` 内置 |

### 4.2 对阅读器的具体收益

| 特性 | 收益 |
|------|------|
| **OKLCH 色板** | 感知均匀的颜色 — 3 个主题在相同亮度值下视觉一致 |
| **`@theme` CSS 变量** | 阅读主题 token 可以直接作为 Tailwind utility 使用 |
| **容器查询** | 阅读器宽度自适应（全屏/侧边栏/弹窗） |
| **Scrollbar utilities** | `scrollbar-thin` + `scrollbar-color-*` 自定义进度条 |
| **逻辑属性** | `pbs-*`/`inline-*` 天然支持 RTL/竖排阅读 |
| **`starting:` variant** | `starting:opacity-0` → 入场动画无需 `@starting-style` 手写 |
| **`@reference`** | 在 Vue scoped style 中引用主题 token 不重复输出 CSS |

### 4.3 迁移路径

```bash
# 1. 安装官方 Rsbuild 插件（替代 PostCSS 插件）
npm add @rsbuild/plugin-tailwindcss tailwindcss @tailwindcss/upgrade -D

# 2. 自动迁移
npx @tailwindcss/upgrade

# 3. 配置 Rsbuild
# rsbuild.config.ts: plugins: [pluginTailwindcss()]

# 4. 入口 CSS 改为
# @import 'tailwindcss';
```

---

## 五、浏览器原生 API 利用

### 5.1 已在使用的 API

| API | 用途 | 状态 |
|-----|------|------|
| `document.startViewTransition()` | 主题切换交叉淡入淡出 | ✅ 带 fallback |
| Speculation Rules (`<script type="speculationrules">`) | 下一章预渲染 | ✅ `eagerness: immediate` |
| `requestAnimationFrame` | 进度条 scroll handler | ✅ |
| `passive: true` event listeners | 滚动性能 | ✅ |

### 5.2 可新增使用的 API

| API | 用途 | 优先级 |
|-----|------|--------|
| **Popover API** | 替代当前设置面板的自定义 backdrop+transition | 🟡 中 |
| **`light-dark()`** | 简化日夜模式颜色切换，替代 `ir-dark` class + 独立变量 | 🟡 中 |
| **CSS Nesting** | 简化 CSS 嵌套语法，消除 SCSS 依赖 | 🟢 低 |
| **`text-wrap: balance`** | 章节标题排版 | 🟢 低 |

### 5.3 Popover API 用于设置面板

当前 `ReaderInlineSettings.vue` 用 `<Teleport to="body">` + 手动 `backdrop` + `opacity/transform` 动画实现面板。Popover API 提供：

```html
<!-- 声明式，无需 JS 管理状态 -->
<button popovertarget="reader-settings">阅读设置</button>
<div id="reader-settings" popover>
  <!-- 自动 top-layer, light-dismiss, ESC 关闭 -->
</div>
```

**收益**：
- 自动 top-layer（无需 z-index 管理）
- 自动 light-dismiss（点击外部关闭）
- 自动 ESC 关闭
- `:popover-open` 伪类驱动动画
- `@starting-style` 配合入场动画

**权衡**：当前实现已经很完善，Popover API 带来的主要是代码简化而非功能增量。建议作为可选重构。

---

## 六、综合评估与优先级建议

### Phase 1: 立即采用（零风险，高收益）

| 序号 | 事项 | 工作量 |
|------|------|--------|
| 1 | **Vue 升级到 3.5** — 使用 `useTemplateRef()`, `useId()`, `v-bind()` in CSS | 1-2h |
| 2 | **`light-dark()` 替代日夜模式颜色变量** — 减少 CSS class toggle | 1h |
| 3 | **`text-wrap: balance`** 用于章节标题 | 5min |
| 4 | **`font-size-adjust`** 字体回退保持视觉一致 | 5min |

### Phase 2: 中期规划（有迁移成本）

| 序号 | 事项 | 工作量 |
|------|------|--------|
| 5 | **Tailwind CSS v4 迁移** — OKLCH 色板 + `@theme` + Oxide 引擎 | 4-8h |
| 6 | **Rsbuild 升级到 2.x** — 配合 TW v4 插件 | 2-4h |
| 7 | **Popover API 重构设置面板** — 可选 | 2h |

### Phase 3: 跟踪等待

| 序号 | 事项 | 触发条件 |
|------|------|---------|
| 8 | **Vue Vapor Mode** — 阅读器内容区编译优化 | 3.6 stable |
| 9 | **Scroll-Driven Animations** 成为 Baseline — 去掉 JS fallback | Safari 支持 |
| 10 | **View Transitions MPA** — 跨页面阅读过渡动画 | Firefox/Safari 支持 |

---

## 七、当前代码已正确使用的前沿特性

以下特性在代码中已正确使用，无需改动：

- ✅ `@property` — CSS 自定义属性类型注册（主题切换平滑过渡）
- ✅ `color-mix(in oklab, ...)` — 从核心 token 派生衍生 token
- ✅ `content-visibility: auto` — 段落跳过渲染
- ✅ `scrollbar-gutter: stable` — 防止滚动条布局偏移
- ✅ `overscroll-behavior: contain` — 防止橡皮筋效果链式传播
- ✅ `text-autospace: ideograph-alpha` — CJK 字符间距（`@supports` 包裹）
- ✅ `scroll-timeline` / `animation-timeline` — 进度条（`@supports` + JS fallback）
- ✅ `document.startViewTransition()` — 主题切换（try-catch fallback）
- ✅ Speculation Rules `eagerness: immediate` — 预渲染
- ✅ `@starting-style` — toolbar/bottombar 入场动画
- ✅ `light-dark()` — backdrop 颜色（已正确使用）
- ✅ `text-wrap: pretty` — 段落排版（`@supports` + `hyphens` fallback）
- ✅ `prefers-reduced-motion` — 无障碍
- ✅ `forced-colors: active` — Windows 高对比度
- ✅ `@media print` — 打印样式

---

## 八、阅读器专用 CSS 特性深度分析

以下来自对 MDN 兼容性数据直接验证：

### 8.1 排版相关 — 完整矩阵

| 特性 | Baseline | 用途 | 阅读器优先级 |
|------|----------|------|------------|
| `text-wrap: balance` | 2024 Mar (Newly) | 标题文字平衡分布 | 🔴 高 |
| `text-wrap: pretty` | ❌ Not Baseline | 防段落最后一行孤字 (Chromium only) | 🔴 高 |
| `font-size-adjust` | 2024 Jul (Newly) | 字体回退保持 x-height 一致 | 🔴 高 |
| `font-optical-sizing` | 2020 (Widely) | 可变字体自动调整笔画 | 🟡 中 |
| `hyphens: auto` | 2023 (Widely) | 连字符断字 | 🟡 中 |
| `hanging-punctuation` | ❌ Not Baseline | 标点悬挂（中英文排版） | 🟡 中 (CJK) |
| `hyphenate-limit-chars` | ❌ Not Baseline | 控制断字最小字符数 | 🟢 低 |
| `text-box-trim` | ❌ Not Baseline | 精确 cap-height 对齐 | 🟢 低 |
| `initial-letter` | ❌ Not Baseline (Safari only) | 首字下沉 | 🟢 低 |
| `@font-face size-adjust` | 2023 Sep (Widely) | 回退字体 metric 对齐，减少 CLS | 🟡 中 |

### 8.2 CJK 中文排版

| 特性 | Baseline | 用途 | 优先级 |
|------|----------|------|--------|
| `text-autospace` | 2025 Nov (Newly) | CJK+拉丁自动间距 | 🟡 中 |
| `text-spacing-trim` | ❌ Not Baseline | CJK 标点间距微调 | 🟢 低 |
| `hanging-punctuation` | ❌ Not Baseline | 标点悬挂 | 🟢 低 |

### 8.3 滚动与进度条

| 特性 | Baseline | 用途 | 优先级 |
|------|----------|------|--------|
| `scrollbar-gutter: stable` | 2024 Dec (Newly) | 预留滚动条空间，防布局偏移 | 🔴 高 ✅ 已用 |
| `scrollbar-width` | 2024 Dec (Newly) | thin/none 滚动条 | 🔴 高 ✅ 已用 |
| `scrollbar-color` | 2024 Dec (Newly) | 自定义滚动条颜色 | 🔴 高 ✅ 已用 |
| `scroll-behavior` | 2022 Mar (Widely) | 平滑滚动 | 🔴 高 |
| `overscroll-behavior` | 2018+ (Widely) | 防止橡皮筋链式传播 | 🔴 高 ✅ 已用 |
| Scroll-Driven Animations | ❌ Not Baseline | scroll-timeline 进度条 | 🟡 中 ✅ 已用 (带 fallback) |
| `scroll-snap` | 2022 Apr (Widely) | 吸附到章节标记 | 🟢 低 |
| `scrollend` event | 2025 (Newly) | 滚动结束事件 | 🟡 中 |

### 8.4 色彩与暗色模式

| 特性 | Baseline | 用途 | 优先级 |
|------|----------|------|--------|
| `light-dark()` | 2024 May (Newly) | 一行代码日夜颜色切换 | 🔴 高 |
| `color-mix()` | 2023 May (Widely) | 动态颜色混合 | 🔴 高 ✅ 已用 |
| `oklch()` / `oklab()` | 2023 May (Widely) | 感知均匀色彩空间 | 🔴 高 ✅ 已用 |
| `color-scheme` | 2022 Jan (Widely) | 声明页面色彩方案 | 🔴 高 ✅ 已用 |
| `prefers-contrast` | 2022 May (Widely) | 对比度偏好适应 | 🟡 中 |
| `forced-colors` | 2022 Sep (Widely) | Windows 高对比度 | 🟡 中 ✅ 已用 |
| `contrast-color()` | 2026 (Newly) | 自动计算安全对比色 | 🟢 低 |

### 8.5 动画与过渡

| 特性 | Baseline | 用途 | 优先级 |
|------|----------|------|--------|
| View Transitions (same-document) | 2024 (Newly) | 页面内过渡动画 | 🟡 中 ✅ 已用 (带 fallback) |
| View Transitions (cross-document) | ❌ Not Baseline | MPA 过渡 | 🟢 低 |
| `@starting-style` | 2024 Aug (Newly) | 首次渲染入场动画 | 🟡 中 ✅ 已用 |
| `transition-behavior: allow-discrete` | 2024 Aug (Newly) | display 属性过渡 | 🟡 中 |
| `animation-composition` | 2023 Jul (Widely) | 多动画组合控制 | 🟢 低 |

### 8.6 布局与容器

| 特性 | Baseline | 用途 | 优先级 |
|------|----------|------|--------|
| CSS Nesting | 2023 Dec (Widely) | 原声 CSS 嵌套 | 🟡 中 |
| `:has()` selector | 2023 Dec (Widely) | 父元素选择 | 🟡 中 |
| Container Queries (size) | 2023 Feb (Widely) | 基于容器响应 | 🟡 中 |
| Container Queries (style) | ❌ Not Baseline | 基于 CSS 属性响应 | 🟢 低 |
| Subgrid | 2023 Sep (Widely) | 跨组件网格对齐 | 🟢 低 |
| Anchor Positioning | 2026 Jan (Newly) | 弹出层相对锚点定位 | 🟡 中 |
| `@layer` | 2022 Mar (Widely) | 级联控制 | 🔴 高 ✅ 已用 |

### 8.7 新型 &lt;dialog&gt; 和 Popover

| 特性 | Baseline | 用途 | 优先级 |
|------|----------|------|--------|
| `<dialog>` | 2022 Mar (Widely) | 原生模态框 | 🔴 高 |
| Popover API | 2024 Apr (Newly) | 声明式弹出层 + light-dismiss | 🟡 中 |
| Invoker Commands | 2025 Dec (Newly) | 声明式按钮交互 | 🟡 中 |
| `inert` attribute | 2023 Apr (Widely) | 禁用背景内容交互 | 🔴 高 |

### 8.8 其他重要 API

| 特性 | Baseline | 用途 | 优先级 |
|------|----------|------|--------|
| `:focus-visible` | 2022 Mar (Widely) | 键盘导航焦点样式 | 🔴 高 ✅ 已用 |
| `@scope` | 2025 Dec (Newly) | CSS 规则作用域 | 🟢 低 |
| Speculation Rules | ❌ Not Baseline (Chrome only) | 预渲染下一章 | 🟡 中 ✅ 已用 |
| Navigation API | 2026 Jan (Newly) | 现代 History API 替代 | 🟡 中 |
| Custom Highlights | 2026 (Newly) | 无需 DOM 修改的文本高亮 | 🟡 中 |
| Screen Wake Lock | 2025 (Newly) | 阅读时保持屏幕常亮 | 🟡 中 |
| WebGPU | ❌ Not Baseline | 对文本阅读无实用价值 | - |
| Sanitizer API | ❌ Not Baseline | 无 Safari 支持，继续 DOMPurify | - |

---

## 九、最终优先级排序

综合四个研究维度的发现，按投入产出比排序：

### 🟢 低投入高回报 (可立即执行)

| # | 事项 | 说明 |
|---|------|------|
| 1 | **Vue 升级 3.5** | `useTemplateRef()`, `useId()`, `v-bind()` in CSS 驱动排版 |
| 2 | **`light-dark()` 全面采用** | 减少 `ir-dark` class toggle，简化颜色管理 |
| 3 | **`text-wrap: balance`** | 章节标题排版优化 |
| 4 | **`font-size-adjust`** | 字体回退视觉一致 |

### 🟡 中投入高回报 (本月)

| # | 事项 | 说明 |
|---|------|------|
| 5 | **Tailwind CSS v4 迁移** | OKLCH 色板 + Oxide 引擎 + `@theme` CSS 变量 + 容器查询 |
| 6 | **Rsbuild 2.x + `@rsbuild/plugin-tailwindcss`** | 配合 TW v4 官方插件 |

### 🔵 长期跟踪

| # | 事项 | 触发条件 |
|---|------|---------|
| 7 | Vue Vapor Mode | 3.6 stable |
| 8 | Scroll-Driven Animations Baseline | Safari 支持 |
| 9 | View Transitions MPA | Firefox/Safari 支持 |
| 10 | Popover API 重构设置面板 | 面板组件重构时机 |

---

## 附：精确浏览器支持数据 (caniuse, July 2026)

| 特性 | 全球支持率 | Baseline | 安全无 fallback? |
|------|-----------|----------|-----------------|
| `scrollbar-gutter: stable` | **92.39%** | 2024 Dec | ✅ 安全，旧浏览器 no-op |
| `content-visibility: auto` | **91.97%** | 2024 Sep | ✅ `@supports` 包裹 |
| `text-wrap: balance` | **89.86%** | 2024 May | ✅ 优雅降级 |
| `@starting-style` | **88.82%** | 2024 Aug | ✅ 即时切换 fallback |
| View Transitions API | **88.46%** | 2024 | ✅ 功能检测 |
| `light-dark()` | **86.37%** | 2024 May | ✅ `@supports` + CSS 变量 fallback |
| `font-size-adjust` | **85.33%** | 2024 Jul | ✅ 渐进增强 |
| Anchor Positioning | **81.67%** | 2026 Jan | ⚠️ 需 OddBird polyfill |
| `text-wrap: pretty` | **~68%** | ❌ | ❌ Firefox 不支持 |
| Scroll-Driven Animations | N/A | ❌ | ❌ 需 polyfill |
| `text-autospace` | ~70% | 部分 | ⚠️ 仅 `normal` 值安全 |

---

## 十、关键数据来源

- MDN: Scroll-Driven Animations, View Transitions API, Popover API, CSS Nesting, `@layer`, `content-visibility`, `scrollbar-gutter`, `light-dark()`, `text-autospace`, Speculation Rules API
- Tailwind CSS v4 Blog & Changelog: v4.0–v4.3.2 release notes
- Vue.js Core CHANGELOG: 3.5 release, 3.6 beta branch
- VueUse Releases: v14.0–v14.2
- Rsbuild/Rspack Releases: v2.1.5
- CanIUse / MDN Browser Compat Data: Baseline status for all listed features