/**
 * AI Store - 全局 AI 状态管理
 * 使用 Pinia 实现跨组件共享 AI 状态
 */
import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import * as webllm from '@mlc-ai/web-llm'

// WebGPU 类型声明
declare global {
    interface Navigator {
        gpu?: {
            requestAdapter(): Promise<GPUAdapter | null>
        }
    }
    interface GPUAdapter {
        // 基本类型声明
    }
}

// 推荐模型列表
export const RECOMMENDED_MODELS = [
    {
        id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
        name: 'Qwen 2.5 1.5B',
        size: '~1GB',
        description: '中文优化，推荐用于中文小说',
        recommended: true,
    },
    {
        id: 'Phi-3.5-mini-instruct-q4f16_1-MLC',
        name: 'Phi 3.5 Mini',
        size: '~2GB',
        description: '综合能力强，英语更佳',
        recommended: true,
    },
    {
        id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
        name: 'Llama 3.2 1B',
        size: '~800MB',
        description: '轻量快速',
        recommended: true,
    },
]

// 获取所有可用模型
export function getAllModels() {
    try {
        const modelList = webllm.prebuiltAppConfig.model_list
        return modelList.map((m: any) => ({
            id: m.model_id,
            name: m.model_id.split('-').slice(0, 3).join(' '),
            size: '未知',
            description: m.model_id,
            recommended: RECOMMENDED_MODELS.some(r => r.id === m.model_id),
        }))
    } catch {
        return RECOMMENDED_MODELS
    }
}

// 模型持久化 key
const STORAGE_KEY = 'ai-last-model'
const getDefaultModel = () => {
    try {
        return localStorage.getItem(STORAGE_KEY) || 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC'
    } catch {
        return 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC'
    }
}
const saveLastModel = (modelId: string) => {
    try {
        localStorage.setItem(STORAGE_KEY, modelId)
    } catch {
        // 忽略存储错误
    }
}

export const useAIStore = defineStore('ai', () => {
    // 状态
    const isSupported = ref(false)
    const isLoading = ref(false)
    const isModelLoaded = ref(false)
    const loadProgress = ref(0)
    const loadStatus = ref('')
    const error = ref<string | null>(null)
    const currentModel = ref<string | null>(null)

    // WebLLM 引擎实例
    const engine = shallowRef<webllm.MLCEngineInterface | null>(null)

    // 检测 WebGPU 支持
    async function checkSupport(): Promise<boolean> {
        try {
            if (!navigator.gpu) {
                isSupported.value = false
                error.value = '您的浏览器不支持 WebGPU'
                return false
            }
            const adapter = await navigator.gpu.requestAdapter()
            if (!adapter) {
                isSupported.value = false
                error.value = '无法获取 GPU 适配器'
                return false
            }
            isSupported.value = true
            return true
        } catch (e) {
            isSupported.value = false
            error.value = 'WebGPU 检测失败'
            return false
        }
    }

    // 加载模型 (使用 Web Worker)
    async function loadModel(modelId: string = getDefaultModel()): Promise<boolean> {
        if (isLoading.value) return false

        // 检测支持
        if (!isSupported.value) {
            const supported = await checkSupport()
            if (!supported) return false
        }

        isLoading.value = true
        loadProgress.value = 0
        loadStatus.value = '初始化...'
        error.value = null

        try {
            // 使用 Web Worker 创建引擎 (推理不阻塞 UI)
            const newEngine = await webllm.CreateWebWorkerMLCEngine(
                new Worker(
                    new URL('../workers/ai-worker.ts', import.meta.url),
                    { type: 'module' }
                ),
                modelId,
                {
                    initProgressCallback: (report) => {
                        loadProgress.value = Math.round(report.progress * 100)
                        loadStatus.value = report.text
                    },
                }
            )

            engine.value = newEngine
            currentModel.value = modelId
            isModelLoaded.value = true
            loadStatus.value = '模型加载完成'

            // 保存最后使用的模型
            saveLastModel(modelId)

            return true
        } catch (e) {
            error.value = `模型加载失败: ${e instanceof Error ? e.message : '未知错误'}`
            return false
        } finally {
            isLoading.value = false
        }
    }

    // 卸载模型
    async function unloadModel() {
        if (engine.value) {
            await engine.value.unload()
            engine.value = null
            currentModel.value = null
            isModelLoaded.value = false
        }
    }

    // 生成回复
    async function chat(
        messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
        options?: {
            temperature?: number
            maxTokens?: number
            onStream?: (text: string) => void
        }
    ): Promise<string> {
        if (!engine.value || !isModelLoaded.value) {
            throw new Error('模型未加载')
        }

        const { temperature = 0.7, maxTokens = 1024, onStream } = options || {}

        try {
            if (onStream) {
                // 流式输出
                let fullResponse = ''
                const asyncChunkGenerator = await engine.value.chat.completions.create({
                    messages,
                    temperature,
                    max_tokens: maxTokens,
                    stream: true,
                })

                for await (const chunk of asyncChunkGenerator) {
                    const delta = chunk.choices[0]?.delta?.content || ''
                    fullResponse += delta
                    onStream(fullResponse)
                }

                return fullResponse
            } else {
                // 非流式
                const response = await engine.value.chat.completions.create({
                    messages,
                    temperature,
                    max_tokens: maxTokens,
                })

                return response.choices[0]?.message?.content || ''
            }
        } catch (e) {
            throw new Error(`生成失败: ${e instanceof Error ? e.message : '未知错误'}`)
        }
    }

    // ========== AI 功能 ==========

    // 生成章节摘要
    async function summarizeChapter(
        content: string,
        title?: string,
        onStream?: (text: string) => void
    ): Promise<string> {
        const systemPrompt = `你是一个小说阅读助手。请用简洁的语言概括章节内容，突出关键情节和人物。
要求：
- 控制在 100-200 字以内
- 不剧透后续内容
- 使用通顺的中文`

        const userPrompt = title
            ? `请概括这个章节：《${title}》\n\n${content.slice(0, 3000)}`
            : `请概括这个章节的内容：\n\n${content.slice(0, 3000)}`

        return await chat([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ], { onStream })
    }

    // 情节回顾
    async function recapPrevious(content: string, lastPosition?: string): Promise<string> {
        const systemPrompt = `你是一个小说阅读助手。用户上次读到某个位置，请帮他回顾之前的情节。
要求：
- 简洁概括之前发生了什么
- 控制在 50-100 字
- 帮助用户快速回忆`

        const userPrompt = lastPosition
            ? `用户上次读到："${lastPosition}"附近。请帮他回顾之前的情节：\n\n${content.slice(0, 2000)}`
            : `请帮用户回顾这些内容的主要情节：\n\n${content.slice(0, 2000)}`

        return await chat([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ])
    }

    // 谐音识别
    async function detectHomophones(content: string): Promise<Array<{
        original: string
        guess: string
        confidence: number
    }>> {
        const systemPrompt = `你是一个中文谐音识别助手。华娱/同人小说常用谐音规避审核，例如：
- "周洁仑" → "周杰伦"
- "冰冰" → "范冰冰"
- "天后" → "王菲"

请分析文本，识别可能是现实人物谐音的词语。

规则：
1. 只识别可能是真实明星/名人的谐音
2. 结合上下文判断（如歌手、演员等描述）
3. 输出 JSON 数组格式

输出示例：
[{"original": "周洁仑", "guess": "周杰伦", "confidence": 0.9}]

如果没有识别到任何谐音，返回空数组 []`

        const userPrompt = `请分析以下文本中的谐音：\n\n${content.slice(0, 4000)}`

        try {
            const response = await chat([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ], { temperature: 0.3 })

            // 解析 JSON
            const jsonMatch = response.match(/\[[\s\S]*\]/)
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0])
            }
            return []
        } catch (e) {
            console.error('谐音识别失败:', e)
            return []
        }
    }

    // 智能问答
    async function askAboutBook(
        question: string,
        context: string,
        onStream?: (text: string) => void
    ): Promise<string> {
        const systemPrompt = `你是一个小说阅读助手。用户会问关于正在阅读的小说的问题。
请根据提供的上下文回答问题。如果上下文中没有相关信息，请诚实地说明。`

        const userPrompt = `上下文：
${context.slice(0, 4000)}

问题：${question}`

        return await chat([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ], { onStream })
    }

    return {
        // 状态
        isSupported,
        isLoading,
        isModelLoaded,
        loadProgress,
        loadStatus,
        error,
        currentModel,

        // 方法
        checkSupport,
        loadModel,
        unloadModel,
        chat,

        // AI 功能
        summarizeChapter,
        recapPrevious,
        detectHomophones,
        askAboutBook,
    }
})
