/**
 * 解码器组合函数
 */
import { computed } from 'vue'
import { useDecoderStore } from '@/stores'

export function useDecoder() {
  const decoderStore = useDecoderStore()

  const decodeText = async (text: string): Promise<string> => {
    return await decoderStore.applyDecoding(text)
  }

  const decodeHtml = async (html: string): Promise<string> => {
    // HTML特殊解码
    let decoded = html

    // 移除HTML标签
    decoded = decoded.replace(/<[^>]*>/g, '')

    // 解码HTML实体
    const textarea = document.createElement('textarea')
    textarea.innerHTML = decoded
    decoded = textarea.value

    // 应用通用解码规则
    decoded = await decodeText(decoded)

    return decoded
  }

  const decodeChapter = async (chapter: {
    title: string
    content: string
  }): Promise<{
    title: string
    content: string
  }> => {
    return {
      title: await decodeText(chapter.title),
      content: await decodeText(chapter.content),
    }
  }

  const batchDecode = async (texts: string[]): Promise<string[]> => {
    const results = await Promise.all(texts.map(text => decodeText(text)))
    return results
  }

  const getDecodingStats = () => {
    return {
      totalRules: decoderStore.state.stats.totalRules,
      enabledRules: decoderStore.state.stats.enabledRules,
      appliedCount: decoderStore.state.stats.appliedCount,
      lastApplied: decoderStore.state.stats.lastApplied,
    }
  }

  return {
    decodeText,
    decodeHtml,
    decodeChapter,
    batchDecode,
    getDecodingStats,
    rules: computed(() => decoderStore.state.rules),
    enabledRules: computed(() => decoderStore.enabledRules),
    isProcessing: computed(() => decoderStore.isProcessing),
  }
}
