/**
 * Speculation Rules API — 下一章预渲染
 *
 * Chromium 121+ 支持完整页面预渲染 (JS 执行 + 资源加载)
 * Safari/Firefox 忽略 <script type="speculationrules"> 标签
 *
 * 策略: immediate eagerness → 最多 10 个 prerender slot
 * 配合现有 fetch 缓存预热形成双保险
 */

let speculationScript: HTMLScriptElement | null = null
let fetchAbortController: AbortController | null = null

/**
 * 注入下一章的 Speculation Rules
 * @param url 下一章的完整 URL
 */
export function injectSpeculationRule(url: string): void {
  if (typeof document === 'undefined') return

  try {
    // 移除旧的 speculation rules
    if (speculationScript) {
      speculationScript.remove()
      speculationScript = null
    }

    const script = document.createElement('script')
    script.type = 'speculationrules'
    script.dataset.readerPrerender = ''
    script.textContent = JSON.stringify({
      prerender: [
        {
          source: 'list',
          urls: [url],
          eagerness: 'immediate',
        },
      ],
    })
    document.head.appendChild(script)
    speculationScript = script
  } catch {
    // speculation rules not critical — fallback to existing fetch prefetch
  }

  // fetch() cache warm for non-Chromium browsers (Safari, Firefox)
  // Speculation Rules only work in Chromium — this provides a lightweight
  // HTTP cache warm for other browsers without JS execution overhead.
  warmFetchCache(url)
}

/**
 * 清理 speculation rules + 取消 pending fetch cache warm
 */
export function clearSpeculationRule(): void {
  if (speculationScript) {
    speculationScript.remove()
    speculationScript = null
  }
  if (fetchAbortController) {
    fetchAbortController.abort()
    fetchAbortController = null
  }
}

/**
 * fetch() cache warm — 为非 Chromium 浏览器预热 HTTP 缓存
 * 轻量级：只触发 HTTP 缓存，不执行 JS，不解析 DOM
 */
function warmFetchCache(url: string): void {
  try {
    // 取消上一个 pending 请求
    if (fetchAbortController) {
      fetchAbortController.abort()
    }
    fetchAbortController = new AbortController()
    fetch(url, { signal: fetchAbortController.signal })
      .catch(() => {})
      .finally(() => {
        fetchAbortController = null
      })
  } catch {
    // cache warm is best-effort
  }
}
