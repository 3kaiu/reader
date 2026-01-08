/**
 * 🎨 useRenderWorker Composable
 * 管理后台渲染 Worker，协调排版与位图生成
 */
import { ref, onMounted, onUnmounted } from 'vue'

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

export function useRenderWorker() {
  const worker = ref<Worker | null>(null)
  const renderedPages = ref<ImageBitmap[]>([])
  const isRendering = ref(false)

  onMounted(() => {
    // 初始化 Worker
    // 注意：在 Vite 中使用 Worker 需要特定的语法
    worker.value = new Worker(
      new URL('../workers/renderWorker.ts', import.meta.url),
      { type: 'module' }
    )

    worker.value.onmessage = (e) => {
      const { type, pages } = e.data
      if (type === 'render-complete') {
        renderedPages.value = pages.map((p: any) => p.bitmap)
        isRendering.value = false
      }
    }
  })

  onUnmounted(() => {
    worker.value?.terminate()
  })

  /**
   * 请求渲染整个章节
   */
  function requestRender(options: RenderOptions) {
    if (!worker.value) return

    isRendering.value = true
    // 渲染前清除旧位图，释放内存
    clearBitmaps()

    worker.value.postMessage({
      type: 'render-chapter',
      options
    })
  }

  /**
   * 释放位图资源
   */
  function clearBitmaps() {
    renderedPages.value.forEach(bitmap => bitmap.close())
    renderedPages.value = []
  }

  return {
    renderedPages,
    isRendering,
    requestRender,
    clearBitmaps
  }
}
