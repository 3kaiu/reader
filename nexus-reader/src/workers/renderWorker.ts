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
 * 简单的文本换行逻辑
 */
function wrapText(ctx: OffscreenCanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = Array.from(text) // 针对中文按字符分割
  const lines: string[] = []
  let currentLine = ''

  for (let i = 0; i < words.length; i++) {
    const testLine = currentLine + words[i]
    const metrics = ctx.measureText(testLine)

    if (metrics.width > maxWidth && i > 0) {
      lines.push(currentLine)
      currentLine = words[i]
    } else {
      currentLine = testLine
    }
  }

  if (currentLine) {
    lines.push(currentLine)
  }

  return lines
}
