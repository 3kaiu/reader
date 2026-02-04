/**
 * Render Worker Composables
 *
 * Provides Web Worker-based rendering for performance-critical operations
 * like text rendering, image processing, and content parsing.
 */

import { ref, onMounted, onUnmounted } from 'vue'
import { logger } from '@/utils/logger'

export interface RenderTask {
  id: string
  type: 'text' | 'image' | 'content' | 'layout'
  data: any
  priority?: 'low' | 'normal' | 'high'
}

export interface RenderResult {
  taskId: string
  success: boolean
  data?: any
  error?: string
  duration: number
}

export function useRenderWorker() {
  const worker = ref<Worker | null>(null)
  const isSupported = ref(typeof Worker !== 'undefined')
  const isReady = ref(false)
  const pendingTasks = ref<Map<string, RenderTask>>(new Map())
  const results = ref<Map<string, RenderResult>>(new Map())

  // Initialize worker
  const initWorker = () => {
    if (!isSupported.value) {
      logger.warn('Web Workers not supported in this environment')
      return
    }

    try {
      // Create worker from inline blob to avoid file path issues
      const workerCode = `
        self.onmessage = function(e) {
          const { taskId, type, data } = e.data;

          try {
            let result;

            switch (type) {
              case 'text':
                result = renderText(data);
                break;
              case 'image':
                result = processImage(data);
                break;
              case 'content':
                result = parseContent(data);
                break;
              case 'layout':
                result = calculateLayout(data);
                break;
              default:
                throw new Error('Unknown render type: ' + type);
            }

            self.postMessage({
              taskId,
              success: true,
              data: result,
              duration: performance.now()
            });
          } catch (error) {
            self.postMessage({
              taskId,
              success: false,
              error: error.message,
              duration: performance.now()
            });
          }
        };

        function renderText(data) {
          // Simulate text rendering
          return {
            html: '<p>' + data.text + '</p>',
            styles: data.styles || {}
          };
        }

        function processImage(data) {
          // Simulate image processing
          return {
            processed: true,
            dimensions: data.dimensions || { width: 100, height: 100 }
          };
        }

        function parseContent(data) {
          // Simulate content parsing
          return {
            parsed: true,
            elements: data.content ? data.content.split(' ') : []
          };
        }

        function calculateLayout(data) {
          // Simulate layout calculation
          return {
            layout: 'calculated',
            bounds: data.bounds || { x: 0, y: 0, width: 800, height: 600 }
          };
        }
      `

      const blob = new Blob([workerCode], { type: 'application/javascript' })
      worker.value = new Worker(URL.createObjectURL(blob))

      worker.value.onmessage = (e) => {
        const result: RenderResult = e.data
        results.value.set(result.taskId, result)

        // Remove from pending tasks
        pendingTasks.value.delete(result.taskId)

        logger.debug('Render task completed', {
          taskId: result.taskId,
          success: result.success,
          duration: result.duration
        })
      }

      worker.value.onerror = (error) => {
        logger.error('Render worker error', { error })
      }

      isReady.value = true
      logger.info('Render worker initialized')
    } catch (error) {
      logger.error('Failed to initialize render worker', { error })
    }
  }

  // Submit render task
  const submitTask = async (task: RenderTask): Promise<RenderResult> => {
    if (!isReady.value || !worker.value) {
      throw new Error('Render worker not available')
    }

    // Add to pending tasks
    pendingTasks.value.set(task.id, task)

    // Send to worker
    worker.value.postMessage(task)

    // Wait for result (simplified - in real implementation you'd use promises)
    return new Promise((resolve, reject) => {
      const checkResult = () => {
        const result = results.value.get(task.id)
        if (result) {
          resolve(result)
        } else {
          setTimeout(checkResult, 10) // Poll every 10ms
        }
      }
      checkResult()
    })
  }

  // Get task status
  const getTaskStatus = (taskId: string) => {
    if (results.value.has(taskId)) {
      return 'completed'
    }
    if (pendingTasks.value.has(taskId)) {
      return 'pending'
    }
    return 'not_found'
  }

  // Cancel task
  const cancelTask = (taskId: string) => {
    pendingTasks.value.delete(taskId)
    logger.debug('Render task cancelled', { taskId })
  }

  // Cleanup
  const cleanup = () => {
    if (worker.value) {
      worker.value.terminate()
      worker.value = null
      isReady.value = false
      pendingTasks.value.clear()
      results.value.clear()
      logger.info('Render worker cleaned up')
    }
  }

  // Auto-initialize on mount
  onMounted(() => {
    initWorker()
  })

  // Cleanup on unmount
  onUnmounted(() => {
    cleanup()
  })

  return {
    // State
    isSupported,
    isReady,
    pendingTasks: readonly(pendingTasks),
    results: readonly(results),

    // Methods
    submitTask,
    getTaskStatus,
    cancelTask,
    cleanup,

    // Re-init if needed
    initWorker
  }
}

// Export types
export type { RenderTask, RenderResult }