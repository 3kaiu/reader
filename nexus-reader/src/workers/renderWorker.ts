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
    const pages = await renderChapter(options)
    // 使用转移所有权 (Transferable objects) 以获得最高性能
    const bitmaps = pages.map(p => p.bitmap)
    self.postMessage({ type: 'render-complete', pages }, bitmaps as any)
  }
}

async function renderChapter(options: RenderOptions): Promise<PageData[]> {
  const {
    text, width, height, fontSize, lineHeight,
    padding, fontFamily, color
  } = options

  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) return []

  ctx.font = `${fontSize}px ${fontFamily}`
  ctx.textBaseline = 'top'
  ctx.fillStyle = color

  const paragraphs = text.split('\n').filter(p => p.trim())
  const pages: PageData[] = []

  let currentPageIndex = 0
  let currentY = padding
  const contentWidth = width - padding * 2
  const contentHeight = height - padding * 2

  // 绘制逻辑
  const drawPage = () => {
    const bitmap = canvas.transferToImageBitmap()
    pages.push({ bitmap, index: currentPageIndex++ })

    // 清空画布准备下一页
    ctx.clearRect(0, 0, width, height)
    // 重新填充背景 (可选，视主题而定)
    // ctx.fillStyle = theme === 'night' ? '#1c1c1e' : '#ffffff';
    // ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = color
    currentY = padding
  }

  for (const para of paragraphs) {
    const lines = wrapText(ctx, para.trim(), contentWidth)

    for (const line of lines) {
      if (currentY + fontSize * lineHeight > contentHeight) {
        drawPage()
      }

      ctx.fillText(line, padding, currentY)
      currentY += fontSize * lineHeight
    }

    // 段落间距
    currentY += fontSize * 0.5
  }

  // 最后一页
  drawPage()

  return pages
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
