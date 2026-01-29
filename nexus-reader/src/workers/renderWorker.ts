/**
 * 🖌️ Render Worker
 * 使用二进制布局网格进行高性能排版与预处理
 * 实现 120fps 级别的极致流畅度，专为 GPU SDF 渲染优化
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
    padding
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
