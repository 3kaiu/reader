/**
 * Content Worker - 内容格式化 Web Worker
 * 用于异步处理大量文本，避免阻塞主线程
 */

interface WorkerMessage {
  type: 'format'
  text: string
}

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const { type, text } = e.data

  if (type === 'format') {
    const formatted = formatContent(text)
    self.postMessage({ type: 'formatted', result: formatted })
  }
}

function formatContent(text: string): string {
  if (!text) return ''

  return text
    .split('\n')
    .filter(p => p.trim())
    .map(p => `<p class="content-paragraph">${escapeHtml(p.trim())}</p>`)
    .join('')
}

function escapeHtml(text: string): string {
  const div = { innerHTML: '' }
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }
  return text.replace(/[&<>"']/g, char => map[char] || char)
}

export { }
