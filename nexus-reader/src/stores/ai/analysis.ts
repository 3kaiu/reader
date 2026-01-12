/**
 * 🔍 AI Analysis - 分析功能模块
 * 从 stores/ai.ts 提取的分析相关函数
 * 
 * 包含:
 * - summarizeChapter: 章节摘要
 * - recapPrevious: 情节回顾
 * - detectHomophones: 谐音检测
 * - detectSlang: 黑话检测 (搜索增强)
 * - detectMemes: 梗典识别 (搜索增强)
 * - buildCharacterGraph: 角色图谱
 */

import { logger } from '../../utils/logger'

// 长章节阈值
export const LONG_CHAPTER_THRESHOLD = 5000

/**
 * 分段分析长文本
 * 将超长内容按段落分割成多个 chunk，分别分析后合并结果
 */
export async function analyzeInChunks<T>(
  content: string,
  analyzer: (chunk: string, index: number) => Promise<T>,
  chunkSize: number = 2500
): Promise<T[]> {
  // 按段落分割
  const paragraphs = content.split(/\n{2,}/)
  const chunks: string[] = []
  let currentChunk = ''

  for (const para of paragraphs) {
    if ((currentChunk + para).length > chunkSize && currentChunk) {
      chunks.push(currentChunk.trim())
      currentChunk = para
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + para
    }
  }
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim())
  }

  // 如果只有一个 chunk，直接分析
  if (chunks.length <= 1) {
    return [await analyzer(content, 0)]
  }

  // 并行分析所有 chunks
  const results = await Promise.all(
    chunks.map((chunk, index) => analyzer(chunk, index))
  )

  return results
}

/**
 * 创建章节摘要 Prompt
 */
export function createSummaryPrompt(title?: string, isLongChapter = false): string {
  const basePrompt = `你是一个专业的小说内容分析师。请用简洁的中文总结以下章节内容。

要求：
1. 概括主要情节发展
2. 提及关键人物及其行动
3. 保留重要对话或转折点
4. 字数控制在 100-200 字

只输出摘要内容，不要添加任何前缀或标题。`

  if (isLongChapter) {
    return basePrompt + '\n\n注意：这是长章节的一部分，请保持摘要的连贯性。'
  }

  return basePrompt
}

/**
 * 创建情节回顾 Prompt
 */
export function createRecapPrompt(lastPosition?: string): string {
  let prompt = `你是一个小说阅读助手。用户可能隔了一段时间回来继续阅读，请帮助用户回顾之前的内容。

请根据以下章节内容，生成一个简洁的"前情提要"，帮助读者快速回忆：
1. 主要角色目前的状态
2. 正在发生的事件
3. 重要的悬念或冲突

风格：像朋友聊天一样自然，字数 100-150 字。`

  if (lastPosition) {
    prompt += `\n\n读者上次读到的位置附近内容：「${lastPosition}」`
  }

  return prompt
}

/**
 * 创建谐音检测 Prompt
 */
export function createHomophonePrompt(): string {
  return `你是一个中文谐音识别专家，擅长发现网络小说中使用谐音替代的敏感词或避讳词。

请分析以下文本，识别所有可能的谐音替代词，并给出原词推测。

返回格式为 JSON 数组：
[
  { "original": "谐音词", "guess": "原意猜测", "confidence": 0.85 }
]

常见谐音模式：
- 部分笔画变化（如"艹" → "草"）
- 拼音相近替换（如"尼玛" → "你妈"）
- 形近字替换（如"兲" → "天"）
- 拆字组合（如"十八子" → "李"）
- 网络谐音（如"栓Q" → "Thank you"）

只返回 JSON，不要其他解释。如果没有发现谐音，返回空数组 []`
}

/**
 * 创建黑话检测 Prompt (AI 降级用)
 */
export function createSlangPrompt(): string {
  return `你是一个网文术语专家，擅长识别网络小说中的黑话和行话。
请分析以下文本中的特殊术语，并解释其含义。

返回格式为 JSON 数组：
[
  { "term": "术语", "meaning": "通俗解释", "category": "internet|novel|gaming|culture|other" }
]

只返回 JSON，不要其他解释。如果没有发现术语，返回空数组 []`
}

/**
 * 创建梗典识别 Prompt (AI 降级用)
 */
export function createMemePrompt(): string {
  return `你是一个文化梗识别专家，擅长发现文本中的流行梗、历史典故和文化引用。
请分析以下文本中的梗和典故。

返回格式为 JSON 数组：
[
  { "reference": "原文引用", "origin": "出处", "explanation": "解释" }
]

只返回 JSON，不要其他解释。如果没有发现梗，返回空数组 []`
}

/**
 * 创建角色图谱 Prompt
 */
export function createCharacterGraphPrompt(): string {
  return `你是一个小说人物分析专家。请从文本中提取出场人物及其关系。

返回格式为 JSON：
{
  "nodes": [
    { "name": "人物名", "role": "protagonist|antagonist|supporting|mentioned", "description": "简短描述" }
  ],
  "edges": [
    { "from": "人物A", "to": "人物B", "relation": "关系描述（如师徒、敌对、情侣、朋友）" }
  ]
}

注意：
1. 只提取明确出现的人物
2. 关系必须有文本依据
3. 最多提取 15 个人物

只返回 JSON，不要其他解释。`
}

/**
 * 解析 JSON 响应
 */
export function parseJSONResponse<T>(response: string, defaultValue: T): T {
  try {
    const cleanJson = response.replace(/```json\s*|\s*```/g, '').trim()
    const parsed = JSON.parse(cleanJson)
    return parsed
  } catch (e) {
    logger.warn('JSON 解析失败', { response: response.slice(0, 200) })
    return defaultValue
  }
}
