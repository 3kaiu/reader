/**
 * 📝 AI Summarizer - 摘要与回顾模块
 * 从 stores/ai.ts 提取的内容总结功能
 */
import { logger } from '../../utils/logger'
import { chat } from './chat'
import {
  analyzeInChunks,
  createSummaryPrompt,
  createRecapPrompt,
  LONG_CHAPTER_THRESHOLD
} from './analysis'

/**
 * 生成章节摘要（支持长章节分段处理）
 */
export async function summarizeChapter(
  content: string,
  title?: string,
  onStream?: (text: string) => void
): Promise<string> {
  try {
    const isLong = content.length > LONG_CHAPTER_THRESHOLD

    if (isLong) {
      // 长章节：分段摘要后再综述
      const chunkSummaries = await analyzeInChunks(content, async (chunk, idx) => {
        const prompt = createSummaryPrompt(title, true)
        return chat([
          { role: 'system', content: prompt },
          { role: 'user', content: chunk }
        ], { temperature: 0.5 })
      })

      const combinedSummary = chunkSummaries.join('\n\n')
      const finalPrompt = `以下是一个长章节的各段摘要，请将其合并为一个连贯的整体摘要（200字以内）：\n\n${combinedSummary}`

      return chat([
        { role: 'system', content: '你是一个专业的小说编辑。' },
        { role: 'user', content: finalPrompt }
      ], { onStream, temperature: 0.3 })
    } else {
      // 普通章节：直接摘要
      const prompt = createSummaryPrompt(title, false)
      return chat([
        { role: 'system', content: prompt },
        { role: 'user', content: content }
      ], { onStream, temperature: 0.5 })
    }
  } catch (e) {
    logger.error('无法生成章节摘要', e as Error, { function: 'summarizeChapter' })
    return '摘要生成失败'
  }
}

/**
 * 情节回顾
 */
export async function recapPrevious(
  content: string,
  lastPosition?: string
): Promise<string> {
  try {
    const prompt = createRecapPrompt(lastPosition)
    return chat([
      { role: 'system', content: prompt },
      { role: 'user', content: `章节内容：\n\n${content}` }
    ], { temperature: 0.6 })
  } catch (e) {
    logger.error('无法生成情节回顾', e as Error, { function: 'recapPrevious' })
    return '回顾生成失败'
  }
}

/**
 * 生成多章节综合回顾 (Smart Recap)
 */
export async function generateSmartRecap(
  chapters: Array<{ title: string, content: string }>,
  onStream?: (text: string) => void
): Promise<string> {
  try {
    const context = chapters.map(c => `【${c.title}】\n${c.content.slice(0, 1500)}`).join('\n\n---\n\n')
    const prompt = `你是一个小说阅读助手。用户刚刚回到本书继续阅读，请根据以下最近阅读的几个章节内容，生成一个简短的"剧情回溯"（150字左右）。
    
    要求：
    1. 语气亲切自然，像老友重逢。
    2. 重点突出：目前主角在哪里？正在做什么？面临什么危机或任务？
    3. 语言简练，不要说废话。
    
    背景章节内容：
    ${context}`

    return chat([
      { role: 'system', content: '你是一个专业且幽默的小说回想助手。' },
      { role: 'user', content: prompt }
    ], { onStream, temperature: 0.7 })
  } catch (e) {
    logger.error('智能回顾生成失败', e as Error)
    return '剧情回顾生成失败'
  }
}

/**
 * 智能问答 (支持对话历史)
 */
export async function askAboutBook(
  question: string,
  context: string,
  options?: {
    useHistory?: boolean
    onStream?: (text: string) => void
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  }
): Promise<string> {
  try {
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      {
        role: 'system',
        content: `你是一个深思熟虑的小说阅读助手。请根据提供的章节内容，回答用户关于该书的问题。
        
        【参考内容】
        ${context.slice(0, 4000)}
        
        要求：
        1. 必须基于提供的参考内容回答。
        2. 如果内容中没有提到，请诚实告知。
        3. 回答语气友好、专业、自然。`
      }
    ]

    // 添加对话历史
    if (options?.useHistory && options.conversationHistory) {
      messages.push(...options.conversationHistory)
    }

    messages.push({ role: 'user', content: question })

    return chat(messages, { onStream: options?.onStream, temperature: 0.7 })
  } catch (e) {
    logger.error('问答失败', e as Error, { function: 'askAboutBook' })
    return '抱歉，我现在无法回答这个问题。'
  }
}
