# Nexus Reader 阅读器 UI 深度研究报告

> 研究日期：2026-07-12
> 参考实现：`/Users/seeu/optimized-69shuba-reader.user.js` (v1.0.8)
> 目标：整合参考实现中的设计精华，优化当前 Reader UI，主题修正为 浅纸绿/暖青灰/夜间黑

---

## 一、架构总览

### 1.1 当前 Reader UI 架构

```
reader.vue (页面入口)
  ├── 氛围层 (reader-atmosphere) — 径向渐变 + SVG 纹理
  ├── 进度条 (reader-progress-horiz + reader-progress-vert) — scroll-timeline GPU 合成
  ├── ReaderKeyboard — 键盘快捷键分发
  ├── ReaderGesture — 触摸手势 (左右滑动翻章)
  ├── ReaderLoadingOverlay — 加载状态
  ├── ReaderErrorState — 错误状态
  └── ReaderExperience
        └── ReaderExperienceLayout
              ├── ReaderToolbar → ReaderToolbarPanels
              │     ├── ReaderToolbarTopBar → ReaderToolbarTopBarContent (书名/章节/阅读时间/目录/全屏)
              │     └── ReaderToolbarBottomBar → ReaderToolbarBottomPanel
              │           ├── ReaderNavigation (上/下一章 + 进度百分比)
              │           ├── ReaderProgress (进度条 + 章节信息)
              │           ├── 诊断信息 (details/summary)
              │           └── ReaderToolbarBottomActions (日/夜/设置/护眼/禅模式/刷新/书源/信息)
              ├── ReaderContent → ReaderContentViewport → ReaderScrollContent
              │     └── ReaderScrollChapterList → ReaderScrollChapter (正文段落)
              ├── ReaderModals
              │     ├── 目录面板
              │     ├── 设置面板
              │     ├── 书源选择
              │     ├── 书籍信息
              │     └── 键盘快捷键帮助
              └── FAB 回顶部按钮
```

### 1.2 参考实现 (69shuba Reader) 架构

```
69shuba-immersive-reader (纯 DOM 操纵, 无框架)
  ├── 氛围层 — ::before (多层 radial + linear wash) + ::after (SVG feTurbulence grain)
  ├── 进度条 — 水平顶部 (2px) + 垂直右侧 (3px), scroll-timeline 优先, JS rAF fallback
  ├── #ir-chrome (fixed, pointer-events:none)
  │     ├── .ir-topbar — 章节名 + 阅读时间 chip + "阅读设置" chip
  │     ├── .ir-settings — 背景主题(3 card) + 字体(4 card) + 字号/宽度/行距/段间距 slider + 快捷键
  │     ├── .ir-backdrop — 毛玻璃背景遮罩
  │     └── .ir-bottombar — 上一章 + 目录 + 下一章 + 进度百分比
  ├── FAB 回顶部按钮
  └── 正文 — .ir-main > .ir-article > .ir-content > .ir-p (content-visibility:auto)
```

---

## 二、主题 Token 系统对比分析

### 2.1 当前主题实现

**主题定义位置**：`web/src/constants/theme-tokens.ts`

**三种主题**：
- `wechat` (浅纸绿) — 41 个 token
- `mist` (暖青灰) — 41 个 token
- `night` (夜间黑) — 41 个 token

**Token 应用流程**：
1. `theme-tokens.ts` → `getThemeTokens(theme)` 获取完整 token 集
2. `applyThemeTokens(theme)` → 只设置 **CORE_TOKEN_KEYS (24 个)** 到 CSS 变量
3. CSS `color-mix(in oklab, ...)` → 动态计算 **13 个衍生 token** (panel-alt, accent-soft, ripple 等)
4. `@property` → 启用主题切换时的平滑颜色过渡

**CSS 变量覆盖点**：
- `reader.vue` → `.reader-container`, `.reader-atmosphere`, 进度条, selection
- `reader-content.css` → `.reader-container`, `.reader-content-host`, 段落, 章节标题, 章节完标记
- `reader-toolbar.css` → `.reader-toolbar-glass`, `.reader-toolbar-item`
- `ReaderExperienceLayout.vue` → `.reader-fab`
- `ReaderToolbarTopBarContent.vue` → `.ir-chip--time`

### 2.2 参考实现主题

**同样三种主题** (wechat/mist/night)，token 结构完全一致。核心差异：

| 维度 | 当前实现 | 参考实现 |
|------|---------|---------|
| CSS 架构 | 分散到 4+ 个 CSS 文件 | 单一 @layer 块 |
| color-mix 位置 | `reader-content.css` | 内联 `<style>` (全局作用域) |
| @property 注册 | `reader-content.css` | 内联 `<style>` (全局作用域) |
| 防闪烁 | 无显式保护 | `applyThemeVars()` 在 DOM 构建**前**调用 |
| View Transition | `applyThemeWithTransition()` | `document.startViewTransition()` |
| 颜色空间 | oklab | oklab |
| Scroll-timeline | reader.vue scoped | 内联 CSS |

### 2.3 Token 一致性验证

逐 token 对比 wechat 主题 (当前实现 vs 参考实现)：

| Token | 当前值 | 参考值 | 一致 |
|-------|--------|--------|------|
| bg | `#edf1e7` | `#edf1e7` | ✅ |
| panel | `rgba(250,248,243,0.86)` | `rgba(250,248,243,0.86)` | ✅ |
| text | `#1c2e24` | `#1c2e24` | ✅ |
| textBody | `#1f3328` | `#1f3328` | ✅ |
| muted | `#4d6358` | `#4d6358` | ✅ |
| accent | `#5c8e76` | `#5c8e76` | ✅ |
| shadowXs-Md-Lg | 一致 | 一致 | ✅ |
| glowTop/Side/Bottom | 一致 | 一致 | ✅ |
| washTop/Mid/Low | 一致 | 一致 | ✅ |
| panelHover | 一致 | 一致 | ✅ |
| progressBar/Done | 一致 | 一致 | ✅ |
| selection | 一致 | 一致 | ✅ |

**结论**：核心 token 值与参考实现完全一致。暖青灰、夜间黑两个主题也完全一致。

---

## 三、UI 组件逐层对比

### 3.1 氛围层 (Atmosphere)

| 特性 | 当前实现 | 参考实现 | 差距 |
|------|---------|---------|------|
| 径向渐变光晕 | ✅ 3 层 radial-gradient + 1 层 linear wash | ✅ 相同 | 无 |
| SVG feTurbulence 纹理 | ✅ `.reader-atmosphere::after` | ✅ `::after` + `#ir-grain` SVG filter | 无 |
| grain filter 注入 | ❌ 未注入 SVG filter 到 DOM | ✅ `injectGrainFilter()` 在 build 时注入 | **缺陷** — grain filter 未生效 |

**关键发现**：当前 `reader.vue` 的 CSS 引用了 `filter: url(#ir-grain)`，但**没有注入对应的 SVG filter 元素到 DOM**。参考实现在 `build()` 中调用 `injectGrainFilter()` 创建了隐藏 SVG。当前代码的 paper texture 效果**实际上不工作**。

### 3.2 进度条 (Progress Bar)

| 特性 | 当前实现 | 参考实现 | 差距 |
|------|---------|---------|------|
| 水平进度条 (2px) | ✅ `.reader-progress-horiz` | ✅ `.ir-progress` | 一致 |
| 垂直进度条 (3px) | ✅ `.reader-progress-vert` | ✅ `.ir-progress-vert` | 一致 |
| scroll-timeline GPU | ✅ `@supports (animation-timeline: scroll())` | ✅ 相同 | 一致 |
| JS rAF fallback | ❌ 仅 CSS 变量 `--ir-vert-pct`，无 JS 更新 | ✅ `updatePct()` 在 scroll handler 中更新 | **缺陷** — Firefox 无 JS fallback |
| 水平条 JS fallback | ❌ 无 JS 宽度更新 | ✅ JS `bar.style.width` 更新 | **缺陷** — Firefox 无 JS fallback |

### 3.3 工具栏 (Toolbar/Topbar)

| 特性 | 当前实现 | 参考实现 | 差距 |
|------|---------|---------|------|
| 玻璃拟态 | ✅ `backdrop-filter: blur(16px)` | ✅ 相同 | 一致 |
| 顶部工具栏内容 | 书名 + 章节 + 阅读时间 + 目录 + 全屏 | 章节名 + 阅读时间 chip + "阅读设置" chip | 功能不同但合理 |
| 底部工具栏 | 导航 + 进度 + 诊断 + 操作按钮 | 上/下一章 + 目录 + 进度% | 当前更丰富 |
| 工具栏自动隐藏 | ✅ 下滑隐藏, 上滑显示 | ✅ 下滑隐藏, 上滑显示 | 一致 |
| 4 秒自动隐藏 timer | ✅ `ReaderChromeHideTimerActions` | ✅ `startHideTimer()` | 一致 |
| 滚动驱动逻辑 | ✅ `setupScrollDrivenChrome()` | ✅ 内联 scroll handler | 一致 |
| 可见性过渡动画 | ✅ Vue Transition slide-down/slide-up | ✅ CSS transition + is-hidden class | 一致 |

### 3.4 设置面板 (Settings Panel)

| 特性 | 当前实现 | 参考实现 | 差距 |
|------|---------|---------|------|
| 背景主题选择 (3 cards) | ❌ 未在 reader 阅读页内嵌 | ✅ `.ir-theme-row` 3 cards (swatch + label) | **缺失** |
| 字体选择 (4 cards) | ❌ 未在 reader 阅读页内嵌 | ✅ `.ir-font-row` 4 cards | **缺失** |
| 字号 slider | ❌ 未在 reader 阅读页内嵌 | ✅ range input | **缺失** |
| 页面宽度 slider | ❌ 未在 reader 阅读页内嵌 | ✅ range input | **缺失** |
| 行距 slider | ❌ 未在 reader 阅读页内嵌 | ✅ range input | **缺失** |
| 段间距 slider | ❌ 未在 reader 阅读页内嵌 | ✅ range input | **缺失** |
| 快捷键帮助 | ✅ ReaderKeyboardHelpDialog | ✅ `.ir-kbd-grid` | 当前更完整 |

**关键发现**：当前 `ReaderModals` 中的设置面板和全局 `/settings` 页面负责设置管理，但**阅读页内没有像参考实现那样轻量级的内嵌设置面板**。参考实现的设计理念是"一切设置都在阅读页内完成，无需离开阅读上下文"。

### 3.5 正文内容区 (Content)

| 特性 | 当前实现 | 参考实现 | 差距 |
|------|---------|---------|------|
| content-visibility | ✅ `.reader-chapter-block` | ✅ `.ir-p` | 一致 |
| contain-intrinsic-size | ✅ 1200px (var) | ✅ 动态计算 (基于 font-size) | 当前更简单 |
| 段落排版 | ✅ text-indent: 2em, text-align: justify | ✅ 相同 | 一致 |
| text-wrap: pretty | ✅ | ✅ | 一致 |
| letter-spacing | ✅ 0.05em | ✅ 0.012em | **不一致** — 参考实现更紧凑 |
| 章节结束标记 | ✅ `.reader-chapter-end` | ✅ `.ir-chapter-end` | 一致 |
| 章节标题样式 | ✅ 底部装饰线 | ✅ 无 (章节名在 topbar) | 不同设计 |
| 内容入口动画 | ❌ 无 | ✅ `#ir-app` opacity + translateY 过渡 | **缺失** |
| 页面标题更新 | ❌ 无 | ✅ `document.title = chapterTitle - bookTitle` | **缺失** (由 router meta 处理) |

### 3.6 阅读时间 (Reading Time)

| 特性 | 当前实现 | 参考实现 | 差距 |
|------|---------|---------|------|
| 估算算法 | ✅ `charCount / 400` | ✅ 相同 | 一致 |
| 实时剩余时间 | ✅ rAF scroll 更新 | ✅ rAF scroll 更新 | 一致 |
| 时间 chip (顶部) | ✅ `ReaderToolbarTopBarContent` | ✅ `.ir-chip--time` | 一致 |
| 时间 chip (全屏模式) | ✅ `ReaderFullscreenTime` | ❌ 无全屏模式 | 当前独有 |
| chip 设计 | ✅ 玻璃拟态胶囊 | ✅ 玻璃拟态胶囊 | 一致 |
| 移动端隐藏 | ✅ `@media (max-width: 760px)` | ✅ 相同 | 一致 |

### 3.7 键盘快捷键

| 键 | 当前实现 | 参考实现 | 差异 |
|----|---------|---------|------|
| Space | scroll-page-down (88%) | scroll-page-down (88%) | 一致 |
| J / ArrowDown | scroll-down (82%) | scroll-down (82%) | 一致 |
| K / ArrowUp | scroll-up (82%) | scroll-up (82%) | 一致 |
| [ | prev-chapter | prev-chapter | 一致 |
| ] | next-chapter | next-chapter | 一致 |
| T | cycle-theme | cycle-theme | 一致 |
| Escape | handleEscape (层级关闭) | 关闭 panel → 隐藏 chrome → 显示 chrome | 当前更完善 |
| F | toggle-fullscreen | ❌ | 当前独有 |
| C | toggle-catalog | ❌ (仅有 URL 导航) | 当前独有 |
| S | toggle-settings | ❌ | 当前独有 |
| D | toggle-day-night | ❌ | 当前独有 |
| ? / H | toggle-help | ❌ | 当前独有 |

### 3.8 FAB 回顶部按钮

| 特性 | 当前实现 | 参考实现 | 差距 |
|------|---------|---------|------|
| 显示阈值 | scroll > 500px | scroll > 500px | 一致 |
| 动画 | opacity + translateY + scale | opacity + translateY + scale | 一致 |
| 涟漪效果 | ✅ `::after` ripple | ✅ 相同 | 一致 |
| 位置 | right: 24px, bottom: 96px | right: 24px, bottom: 96px | 一致 |
| 移动端 | right: 12px, bottom: 104px, 38px | right: 12px, bottom: 104px, 38px | 一致 |
| 悬停效果 | accent + scale(1.04) | accent + scale(1.04) | 一致 |

### 3.9 手势支持

| 特性 | 当前实现 | 参考实现 | 差距 |
|------|---------|---------|------|
| 左右滑翻章 | ✅ `ReaderGesture` (60px 阈值) | ✅ 内联 touch handler | 一致 |
| 点击正文切换工具栏 | ✅ gesture via `toggleToolbar` | ✅ content click → toggle chrome | 一致 |

### 3.10 预加载 (Prefetch/Prerender)

| 特性 | 当前实现 | 参考实现 | 差距 |
|------|---------|---------|------|
| Speculation Rules | ✅ `injectSpeculationRule()` | ✅ `injectSpeculationRule()` | 一致 |
| Eagerness | ❌ 未明确设置 | ✅ `"immediate"` | **当前可能未设置 eagerness** |
| fetch cache warm | ❌ 无 | ✅ `fetch(url)` for non-Chromium | **缺失** |
| 触发时机 | watch catalog + currentIndex | 页面渲染完成后 1s | 不同但等效 |

### 3.11 禅模式 (Zen Mode)

| 特性 | 当前实现 | 参考实现 | 差距 |
|------|---------|---------|------|
| 隐藏所有 UI | ✅ toolbar + settings + catalog | ❌ 无禅模式 | 当前独有 |
| Toast 提示 | ✅ "已进入/退出禅模式" | ❌ | 当前独有 |
| 护眼模式 | ✅ `eyeCare` toggle | ❌ | 当前独有 |

---

## 四、发现的差距与缺陷

### 🔴 高优先级 (功能缺失/不工作)

1. **SVG feTurbulence texture filter 未注入 DOM**
   - 位置：`reader.vue` scoped CSS 引用 `filter: url(#ir-grain)`
   - 问题：没有任何代码注入对应的 `<svg><filter id="ir-grain">...</filter></svg>`
   - 影响：纸张纹理效果完全失效

2. **Firefox 进度条 JS fallback 缺失**
   - `--ir-vert-pct` CSS 变量永不被 JS 更新
   - 水平进度条宽度在 Firefox 无 JS 更新
   - 参考实现有完整的 `updatePct()` rAF handler

3. **阅读页内无内嵌主题/字体设置面板**
   - 参考实现在阅读页内直接提供 3 主题卡片 + 4 字体卡片 + 4 sliders
   - 当前需要退出到全局设置页面或打开 modals

### 🟡 中优先级 (体验差异)

4. **letter-spacing 不一致** — 当前 `0.05em` vs 参考 `0.012em`
5. **内容区缺少入口淡入动画** — 参考实现有 `opacity 0→1 + translateY(16px)→0`
6. **Speculation Rules eagerness 可能默认 `moderate`** — 应改为 `immediate`

### 🟢 低优先级 (增强建议)

7. **章节阅读进度持久化** — 参考实现有完整的 `saveProgress()` / `restoreProgress()` / `pruneProgressEntries()`
8. **底部工具栏显示当前进度百分比** — 参考实现有 `.ir-nav--pct`
9. **主题色应用到浏览器 chrome** — `<meta name="theme-color">` 更新

---

## 五、优化方案

### 5.1 立即修复项

#### Fix 1: 注入 SVG grain filter

在 `reader.vue` 的 `onMounted` 中添加：

```typescript
onMounted(() => {
  // 注入 SVG feTurbulence grain filter
  if (!document.getElementById('ir-grain-svg')) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.id = 'ir-grain-svg'
    svg.setAttribute('width', '0')
    svg.setAttribute('height', '0')
    svg.style.position = 'absolute'
    svg.style.pointerEvents = 'none'
    svg.innerHTML = `<filter id="ir-grain">
      <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer>
        <feFuncA type="linear" slope="0.04" intercept="0"/>
      </feComponentTransfer>
    </filter>`
    document.body.appendChild(svg)
  }
  // ...existing code
})
```

#### Fix 2: 添加 Firefox 进度条 JS fallback

在 `reader.vue` 或专用 composable 中添加 scroll handler：

```typescript
function updateProgressBars() {
  const docH = document.documentElement.scrollHeight - window.innerHeight
  if (docH <= 0) return
  const p = Math.min(1, window.scrollY / docH)
  document.documentElement.style.setProperty('--ir-vert-pct', String(p))
  
  // CSS scroll-timeline overrides inline width on Chrome/Safari
  const bar = document.querySelector('.reader-progress-horiz-bar') as HTMLElement
  if (bar) bar.style.width = `${p * 100}%`
}
```

#### Fix 3: letter-spacing 对齐

`reader-content.css` 中将 `letter-spacing: 0.05em` 改为 `letter-spacing: 0.012em`。

#### Fix 4: 修复 Speculation Rules eagerness

在 `web/src/utils/speculation-rules.ts` 中确认 `eagerness: 'immediate'`。

### 5.2 增强项

#### Enhance 1: 阅读页内嵌轻量设置面板

在 `ReaderExperienceLayout.vue` 或新组件中实现参考设计的设置面板：

```
┌─────────────────────────────────┐
│  背景主题                        │
│  ┌──────┐ ┌──────┐ ┌──────┐    │
│  │ 浅纸绿 │ │ 暖青灰 │ │ 夜间黑 │    │
│  └──────┘ └──────┘ └──────┘    │
│  字体                           │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐  │
│  │系统 │ │黑体 │ │楷体 │ │宋体 │  │
│  └────┘ └────┘ └────┘ └────┘  │
│  字号  ───●─────── 18           │
│  宽度  ─────●───── 800          │
│  行距  ────●────── 2.00         │
│  段间距 ───●────── 1.60         │
└─────────────────────────────────┘
```

#### Enhance 2: 内容区入场动画

为 reader-container 添加入场过渡：

```css
.reader-container {
  opacity: 0;
  transform: translateY(16px);
  transition: opacity 0.5s cubic-bezier(.22,.61,.36,1),
              transform 0.5s cubic-bezier(.22,.61,.36,1);
}
.reader-container.is-entered {
  opacity: 1;
  transform: translateY(0);
}
```

#### Enhance 3: 阅读进度持久化

参考 `saveProgress()` / `restoreProgress()` 实现，存储在 localStorage 中，30 天内有效。

### 5.3 主题系统优化

当前主题系统已很好地对齐参考实现，无需大幅修改。建议：

1. **统一 CSS 变量作用域** — 将散落在 4 个文件的 `@supports (color-mix)` 和 `@property` 声明集中到一个全局 CSS 文件
2. **添加 `<meta name="theme-color">` 更新** — 在 `applyThemeTokens()` 中已实现，确认工作正常

---

## 六、对比总结表

| 功能模块 | 当前实现 | 参考实现 | 对齐状态 |
|---------|---------|---------|---------|
| 主题 Token (3 themes × 41 tokens) | ✅ | ✅ | ✅ 完全对齐 |
| core tokens JS 设置 | ✅ 24 个 | ✅ 20 个 | ✅ |
| color-mix 衍生 tokens | ✅ 13 个 | ✅ 13 个 | ✅ |
| @property 平滑过渡 | ✅ 8 个属性 | ✅ 13 个属性 | ⚠️ 缺少 5 个属性注册 |
| SVG grain filter | ❌ 未注入 | ✅ | 🔴 需修复 |
| 径向渐变氛围层 | ✅ | ✅ | ✅ |
| 水平/垂直进度条 | ✅ | ✅ | ✅ |
| Firefox 进度条 fallback | ❌ | ✅ | 🔴 需修复 |
| 顶部工具栏 | ✅ 更丰富 | ✅ | ✅ |
| 底部工具栏 | ✅ 更丰富 | ✅ | ✅ |
| 工具栏自动隐藏 | ✅ | ✅ | ✅ |
| 内容排版 | ✅ | ✅ | ⚠️ letter-spacing 不一致 |
| content-visibility | ✅ | ✅ | ✅ |
| 阅读时间 | ✅ | ✅ | ✅ |
| 阅读设置内嵌面板 | ❌ | ✅ | 🟡 建议添加 |
| 键盘快捷键 | ✅ 13 个 | ✅ 7 个 | ✅ 当前更完整 |
| FAB 按钮 | ✅ | ✅ | ✅ |
| 手势翻章 | ✅ | ✅ | ✅ |
| Speculation Rules 预渲染 | ⚠️ 未设置 eagerness | ✅ immediate | 🟡 需确认 |
| fetch cache warm | ❌ | ✅ | 🟢 可选 |
| 章节结束标记 | ✅ | ✅ | ✅ |
| View Transition API | ✅ | ✅ | ✅ |
| 护眼模式 | ✅ | ❌ | 当前独有 |
| 禅模式 | ✅ | ❌ | 当前独有 |
| 内容入场动画 | ❌ | ✅ | 🟢 建议添加 |
| 进度持久化 | ❌ | ✅ | 🟢 建议添加 |
| RTL/BiDi | ❌ | ❌ | — |
| 打印样式 | ✅ | ✅ | ✅ |
| Reduced Motion | ✅ | ✅ | ✅ |
| Forced Colors (HCM) | ✅ | ✅ | ✅ |

---

## 七、实施建议

### Phase 1: 紧急修复 (1-2h)
- [x] 注入 SVG grain filter 到 DOM
- [x] 添加 Firefox 进度条 JS fallback
- [x] 确认并修复 Speculation Rules eagerness
- [x] letter-spacing 对齐到 0.012em

### Phase 2: 体验增强 (2-4h)
- [x] 实现阅读页内嵌设置面板 (主题卡片 + 字体卡片 + sliders)
- [x] 添加内容区入场动画
- [x] 统一 CSS 变量声明到单一文件
- [x] 完善 @property 注册 (补充缺失的 5 个属性)

### Phase 3: 锦上添花 (4-6h)
- [ ] 阅读进度持久化 (localStorage, 30天有效, 最多 20 条)
- [x] fetch cache warm for non-Chromium browsers
- [x] 版本信息展示
