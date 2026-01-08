/**
 * 🧠 AI Features - AI 功能函数封装
 * 从 stores/ai.ts 提取的高级 AI 功能
 */

import type { HomophoneItem } from '../../types/ai'

// ==================== Prompt 模板 ====================

export const PROMPTS = {
    summarize: {
        system: `你是一个小说阅读助手。请用简洁的语言概括章节内容，突出关键情节和人物。
要求：
- 控制在 100-200 字以内
- 不剧透后续内容
- 使用通顺的中文`,
        user: (title: string | undefined, content: string) =>
            title
                ? `请概括这个章节：《${title}》\n\n${content.slice(0, 3000)}`
                : `请概括这个章节的内容：\n\n${content.slice(0, 3000)}`,
    },

    recap: {
        system: `你是一个小说阅读助手。用户上次读到某个位置，请帮他回顾之前的情节。
要求：
- 简洁概括之前发生了什么
- 控制在 50-100 字
- 帮助用户快速回忆`,
        user: (lastPosition: string | undefined, content: string) =>
            lastPosition
                ? `用户上次读到："${lastPosition}"附近。请帮他回顾之前的情节：\n\n${content.slice(0, 2000)}`
                : `请帮用户回顾这些内容的主要情节：\n\n${content.slice(0, 2000)}`,
    },

    homophone: {
        system: `你是一个专业的网文/同人小说内容分析助手。你的任务是分析文本中的"隐喻、映射、谐音、代称"。
很多小说为了规避审核或增加趣味性，会使用谐音、别名或描述性称呼来指代现实中的【人物】或【公司/组织】。

请分析文本，提取这些映射关系。

# 识别目标
1. **人物映射**：
   - 谐音：如 "周洁仑" -> "周杰伦", "杨密" -> "杨幂"
   - 昵称/黑话：如 "大强子" -> "刘强东", "马总" -> "马云/马化腾"
   - 描述性指代：如 "那个姓马的互联网大佬"
2. **公司/组织映射**：
   - 谐音/变体：如 "企鹅厂" -> "腾讯", "某里" -> "阿里", "菊花厂" -> "华为", "大米科技" -> "小米"
   - 英文缩写变体：如 "P站" -> "Pixiv/Pornhub" (视上下文)

# 输出要求
1. **严格的 JSON 数组格式**。
2. 每个对象包含：
   - \`original\`: 文本中出现的词 (必填)
   - \`guess\`: 猜测的真实名称 (必填)
   - \`confidence\`: 置信度 (0.0 - 1.0)
3. **不要**包含 Markdown 标记（如 \`\`\`json）。
4. 如果原词就是真实名称，**不需要**输出。
5. 结果去重。

# 示例
输入："企鹅厂的马总和隔壁大米科技的雷布斯在喝茶。"
输出：
[
    {"original": "企鹅厂", "guess": "腾讯", "confidence": 0.95},
    {"original": "马总", "guess": "马化腾", "confidence": 0.8},
    {"original": "大米科技", "guess": "小米", "confidence": 0.95},
    {"original": "雷布斯", "guess": "雷军", "confidence": 0.9}
]

如果没有发现任何映射，返回空数组 []。`,
        user: (content: string) =>
            `请分析以下文本中的映射关系：\n\n${content.slice(0, 3000)}`,
    },

    askBook: {
        system: `你是一个小说阅读助手。用户会问关于正在阅读的小说的问题。
请根据提供的上下文回答问题。如果上下文中没有相关信息，请诚实地说明。`,
        user: (question: string, context: string) =>
            `上下文：\n${context.slice(0, 4000)}\n\n问题：${question}`,
    },
}

// ==================== 结果解析工具 ====================

interface RawHomophoneItem {
    original?: string | unknown
    guess?: string | string[] | unknown
    confidence?: number | string | unknown
}

/**
 * 解析谐音识别 API 返回的 JSON 响应
 */
export function parseHomophoneResponse(response: string): HomophoneItem[] {
    let parsed: HomophoneItem[] | { results?: HomophoneItem[] } = []

    try {
        const cleanJson = response.replace(/```json\s*|\s*```/g, '').trim()
        parsed = JSON.parse(cleanJson) as HomophoneItem[] | { results?: HomophoneItem[] }
    } catch {
        const jsonMatch = response.match(/\[[\s\S]*\]/)
        if (jsonMatch) {
            try {
                parsed = JSON.parse(jsonMatch[0]) as HomophoneItem[]
            } catch {
                parsed = []
            }
        }
    }

    const rawResults: RawHomophoneItem[] = Array.isArray(parsed)
        ? parsed
        : (parsed as { results?: RawHomophoneItem[] }).results || []

    return rawResults
        .map((item): HomophoneItem | null => {
            // 处理 confidence
            let confidence = 0.5
            if (typeof item.confidence === 'number') {
                confidence = item.confidence
            } else if (typeof item.confidence === 'string') {
                if (item.confidence.includes('%')) {
                    confidence = parseFloat(item.confidence) / 100
                } else {
                    confidence = parseFloat(item.confidence)
                }
            }

            if (isNaN(confidence)) confidence = 0.5
            confidence = Math.min(Math.max(confidence, 0), 1)

            // 处理 guess
            const guessValue = item.guess
            const guessArray = Array.isArray(guessValue)
                ? guessValue.map((g) => String(g))
                : typeof guessValue === 'string'
                    ? [guessValue]
                    : [String(guessValue || '')]

            const original = String(item.original || '').trim()
            const guess = guessArray.map((g) => String(g).trim()).filter((g) => g.length > 0)

            if (!original || guess.length === 0) {
                return null
            }

            return { original, guess, confidence }
        })
        .filter((item): item is HomophoneItem => item !== null)
        .filter(
            (item) =>
                item.original &&
                item.guess.length > 0 &&
                !item.guess.includes(item.original)
        )
}

// ==================== 功能函数工厂 ====================

type ChatFunction = (
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options?: {
        temperature?: number
        topP?: number
        maxTokens?: number
        onStream?: (text: string) => void
        jsonMode?: boolean
        seed?: number
        presencePenalty?: number
        frequencyPenalty?: number
    }
) => Promise<string>

/**
 * 创建 AI 功能函数集
 * @param chat - 底层 chat 函数
 */
export function createAIFeatures(chat: ChatFunction) {
    return {
        /** 生成章节摘要 */
        async summarizeChapter(
            content: string,
            title?: string,
            onStream?: (text: string) => void
        ): Promise<string> {
            return await chat(
                [
                    { role: 'system', content: PROMPTS.summarize.system },
                    { role: 'user', content: PROMPTS.summarize.user(title, content) },
                ],
                { onStream }
            )
        },

        /** 情节回顾 */
        async recapPrevious(content: string, lastPosition?: string): Promise<string> {
            return await chat([
                { role: 'system', content: PROMPTS.recap.system },
                { role: 'user', content: PROMPTS.recap.user(lastPosition, content) },
            ])
        },

        /** 谐音识别与映射分析 */
        async detectHomophones(content: string): Promise<HomophoneItem[]> {
            try {
                const response = await chat(
                    [
                        { role: 'system', content: PROMPTS.homophone.system },
                        { role: 'user', content: PROMPTS.homophone.user(content) },
                    ],
                    {
                        temperature: 0.1,
                        jsonMode: true,
                    }
                )
                return parseHomophoneResponse(response)
            } catch {
                return []
            }
        },

        /** 智能问答 */
        async askAboutBook(
            question: string,
            context: string,
            onStream?: (text: string) => void
        ): Promise<string> {
            return await chat(
                [
                    { role: 'system', content: PROMPTS.askBook.system },
                    { role: 'user', content: PROMPTS.askBook.user(question, context) },
                ],
                { onStream }
            )
        },
    }
}
