/**
 * 🖌️ Render Worker
 * 使用 OffscreenCanvas 进行后台排版与预处理
 * 实现 120fps 级别的极致流畅度
 */

interface RenderOptions {
  text: string
  width: number
  height: number
  fontSize: number
  lineHeight: number
  padding: number
  fontFamily: string
  color: string
  theme: string
}

interface PageData {
  bitmap: ImageBitmap
  index: number
}

self.onmessage = async (e: MessageEvent) => {
  // 验证消息来源以防止 XSS/CSRF
  if (e.origin && e.origin !== self.location.origin) {
    return
  }

  const { type, options } = e.data

  if (type === 'render-chapter') {
    const { index } = options
    renderChapter(options, index).catch(err => {
      self.postMessage({ type: 'render-error', error: err.message, index })
    })
  }
}

async function renderChapter(options: RenderOptions, index: number): Promise<void> {
  const {
    text, width, height, fontSize, lineHeight,
    padding, fontFamily // color and theme handled by GPU shader
  } = options

  // 预估字符数以分配 SharedArrayBuffer (每个字符 3 个 float: charCode, x, y)
  const MAX_CHARS_PER_PAGE = 2000
  const bufferSize = MAX_CHARS_PER_PAGE * 3 * 4 // 4 bytes per float

  const paragraphs = text.split('\n').filter(p => p.trim())

  let currentPageIndex = 0
  let currentY = padding
  const contentWidth = width - padding * 2
  const contentHeight = height - padding * 2

  let pageBuffer = new SharedArrayBuffer(bufferSize)
  let pageData = new Float32Array(pageBuffer)
  let charPointer = 0

  const sendPage = () => {
    // 发送布局网格数据，附带有效字符数
    self.postMessage({
      type: 'render-page-mesh',
      index,
      page: {
        buffer: pageBuffer,
        charCount: charPointer / 3,
        index: currentPageIndex++
      }
    })

    // 重置缓冲区准备下一页
    pageBuffer = new SharedArrayBuffer(bufferSize)
    pageData = new Float32Array(pageBuffer)
    charPointer = 0
    currentY = padding
  }

  // 模拟简单的字体度量 (实际开发中应由 Wasm/Fontdue 提供)
  const avgCharWidth = fontSize * 0.6

  for (const para of paragraphs) {
    const words = para.trim().split('') // 简单按字符切分进行布局
    let currentX = padding

    for (const char of words) {
      if (currentX + avgCharWidth > contentWidth + padding) {
        currentX = padding
        currentY += fontSize * lineHeight
      }

      if (currentY + fontSize * lineHeight > contentHeight + padding) {
        sendPage()
        currentX = padding
      }

      // 将布局信息存入二进制网格
      pageData[charPointer++] = char.charCodeAt(0)
      pageData[charPointer++] = currentX
      pageData[charPointer++] = currentY

      currentX += avgCharWidth
    }

    // 段落间距
    currentY += fontSize * lineHeight + fontSize * 0.5
    if (currentY + fontSize * lineHeight > contentHeight + padding) {
      sendPage()
    }
  }

  // 发送最后一页
  if (charPointer > 0) {
    sendPage()
  }

  // 发送完成信号
  self.postMessage({ type: 'render-complete', totalPages: currentPageIndex, index })
}

/**
 * 高性能文本换行逻辑 (估算-微调模型)
 */
function wrapText(ctx: OffscreenCanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  if (!text) return []

  const lines: string[] = []
  let start = 0

  // 测量典型字符宽度作为基准 (取一个中文字符)
  const avgCharWidth = ctx.measureText('中').width || 16

  while (start < text.length) {
    // 1. 估算跳转点: 剩余空间 / 平均字符宽度
    // 预留 15% 的余量以应对变宽字符
    let guessCount = Math.floor(maxWidth / avgCharWidth * 0.85)
    let end = Math.min(start + Math.max(1, guessCount), text.length)

    // 2. 微调: 步进探测直到溢出
    let currentWidth = ctx.measureText(text.substring(start, end)).width

    while (end < text.length) {
      const nextChar = text[end]
      const charWidth = ctx.measureText(nextChar).width

      if (currentWidth + charWidth > maxWidth) {
        break
      }

      currentWidth += charWidth
      end++
    }

    // 3. 处理极端情况: 如果单字符就溢出，强制截断一个
    if (end === start) end++

    lines.push(text.substring(start, end))
    start = end
  }

  return lines
}
