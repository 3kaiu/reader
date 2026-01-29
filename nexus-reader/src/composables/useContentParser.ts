import { ref, shallowRef } from 'vue'
import { perfMonitor } from '../services/performance/monitor'

/**
 * useContentParser - 异步内容解析 Hook
 * 使用 Web Worker 避免主线程阻塞
 */
export function useContentParser() {
    const isParsing = ref(false)
    const result = shallowRef('')

    // 用于内存缓存已解析的内容
    const cache = new Map<string, string>()

    const parse = async (text: string): Promise<string> => {
        if (!text) return ''

        // 检查缓存
        const cacheKey = text.substring(0, 100) + text.length
        if (cache.has(cacheKey)) {
            return cache.get(cacheKey)!
        }

        return new Promise((resolve) => {
            isParsing.value = true

            const markKey = `parse-worker-${Math.random().toString(36).substring(7)}`
            perfMonitor.startMark(markKey)

            const worker = new Worker(
                new URL('../utils/contentWorker.ts', import.meta.url),
                { type: 'module' }
            )

            worker.onmessage = (e) => {
                const { type, result: formatted } = e.data
                if (type === 'formatted') {
                    result.value = formatted
                    cache.set(cacheKey, formatted)
                    isParsing.value = false

                    perfMonitor.endMark(markKey, 'content-parse-success', {
                        textLength: text.length,
                        source: 'hook'
                    })

                    worker.terminate()
                    resolve(formatted)
                }
            }

            worker.onerror = (err) => {
                console.error('Content Worker Error:', err)
                isParsing.value = false
                worker.terminate()
                // 降级使用同步处理
                resolve(syncFormat(text))
            }

            worker.postMessage({ type: 'format', text })
        })
    }

    return {
        parse,
        isParsing,
        result
    }
}

/**
 * 异步解析内容的纯函数，方便在 Store 中直接使用
 */
export async function formatContentAsync(text: string): Promise<string> {
    if (!text) return ''

    const markKey = `parse-async-${Math.random().toString(36).substring(7)}`
    perfMonitor.startMark(markKey)

    return new Promise((resolve) => {
        const worker = new Worker(
            new URL('../utils/contentWorker.ts', import.meta.url),
            { type: 'module' }
        )

        worker.onmessage = (e) => {
            const { type, result } = e.data
            if (type === 'formatted') {
                perfMonitor.endMark(markKey, 'content-parse-success', {
                    textLength: text.length,
                    source: 'direct'
                })
                worker.terminate()
                resolve(result)
            }
        }

        worker.onerror = (err) => {
            console.error('Content Worker Error:', err)
            worker.terminate()
            resolve(syncFormat(text))
        }

        worker.postMessage({ type: 'format', text })
    })
}

// 降级同步处理函数
function syncFormat(text: string): string {
    return text
        .split('\n')
        .filter(p => p.trim())
        .map(p => `<p class="content-paragraph">${p.trim()}</p>`)
        .join('')
}
