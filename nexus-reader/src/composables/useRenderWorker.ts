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
  const renderedMeshesMap = ref<Map<number, any[]>>(new Map()) // 存储二进制 Mesh 数据
  const isRendering = ref(false)
  const currentChapterIndex = ref(-1)

  onMounted(() => {
    worker.value = new Worker(
      new URL('../workers/renderWorker.ts', import.meta.url),
      { type: 'module' }
    )

    worker.value.onmessage = (e) => {
      const { type, page, totalPages, index: reqIndex } = e.data

      if (type === 'render-page-mesh') {
        const targetIndex = reqIndex ?? currentChapterIndex.value
        if (!renderedMeshesMap.value.has(targetIndex)) {
          renderedMeshesMap.value.set(targetIndex, [])
        }
        renderedMeshesMap.value.get(targetIndex)!.push(page)
        console.log(`💎 Received Binary Mesh for page ${page.index} (Chars: ${page.charCount})`)
        // TODO: Pass buffer to GLRenderer
      } else if (type === 'render-complete') {
        isRendering.value = false
        console.log(`🎨 Render complete for index ${reqIndex ?? currentChapterIndex.value}: ${totalPages} pages`)
      }
    }
  })

  onUnmounted(() => {
    worker.value?.terminate()
    clearAllCaches()
  })

  /**
   * 请求渲染指定章节 (支持流式返回与预渲染)
   */
  function requestRender(options: RenderOptions, index: number, isPreload = false) {
    if (!worker.value) return

    if (!isPreload) {
      isRendering.value = true
      currentChapterIndex.value = index
      // 这里的逻辑可以保留当前章，只清除非相关的
      cleanupCache(index)
    }

    worker.value.postMessage({
      type: 'render-chapter',
      options: { ...options, index } // 传递 index 以便回传时标识
    })
  }

  /**
   * 清理非目标章节数据
   */
  function cleanupCache(keepIndex: number) {
    for (const index of renderedMeshesMap.value.keys()) {
      if (index !== keepIndex && index !== keepIndex + 1) {
        renderedMeshesMap.value.delete(index)
      }
    }
  }

  function clearAllCaches() {
    renderedMeshesMap.value.clear()
  }

  return {
    renderedMeshesMap,
    isRendering,
    requestRender,
    clearAllCaches
  }
}
