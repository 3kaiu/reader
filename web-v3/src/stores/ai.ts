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

// 模型厂商映射
const MODEL_VENDORS: Record<string, string> = {
    'Qwen': '阿里 Qwen',
    'Llama': 'Meta Llama',
    'Phi': 'Microsoft Phi',
    'Gemma': 'Google Gemma',
    'Mistral': 'Mistral AI',
    'SmolLM': 'HuggingFace',
    'TinyLlama': 'TinyLlama',
    'RedPajama': 'Together AI',
    'Hermes': 'NousResearch',
    'WizardMath': 'WizardLM',
    'stablelm': 'Stability AI',
}

// 从模型 ID 解析厂商
function getVendor(modelId: string): string {
    for (const [key, value] of Object.entries(MODEL_VENDORS)) {
        if (modelId.toLowerCase().includes(key.toLowerCase())) {
            return value
        }
    }
    return '其他'
}

// 从模型 ID 估算大小 (基于参数量和量化)
function estimateSize(modelId: string): string {
    const id = modelId.toLowerCase()

    // 解析参数量
    let params = 0
    if (id.includes('0.5b')) params = 0.5
    else if (id.includes('1b') || id.includes('1.5b')) params = 1.5
    else if (id.includes('2b')) params = 2
    else if (id.includes('3b')) params = 3
    else if (id.includes('7b') || id.includes('8b')) params = 7
    else if (id.includes('13b')) params = 13
    else if (id.includes('70b')) params = 70

    // 解析量化方式
    let ratio = 1
    if (id.includes('q4f16') || id.includes('q4f32')) ratio = 0.5
    else if (id.includes('q0f16') || id.includes('q0f32')) ratio = 2

    if (params === 0) return '未知'

    const sizeMB = Math.round(params * 1000 * ratio)
    if (sizeMB >= 1000) {
        return `~${(sizeMB / 1000).toFixed(1)}GB`
    }
    return `~${sizeMB}MB`
}

// 获取所有可用模型（带厂商和大小）
export function getAllModels() {
    try {
        const modelList = webllm.prebuiltAppConfig.model_list
        return modelList.map((m: any) => {
            const id = m.model_id
            return {
                id,
                name: id.split('-').slice(0, 3).join(' '),
                size: estimateSize(id),
                vendor: getVendor(id),
                description: id,
                recommended: RECOMMENDED_MODELS.some(r => r.id === id),
            }
        })
    } catch {
        return RECOMMENDED_MODELS.map(m => ({ ...m, vendor: getVendor(m.id) }))
    }
}

// 获取所有厂商列表
export function getVendors(): string[] {
    const models = getAllModels()
    const vendors = new Set(models.map((m: any) => m.vendor))
    return ['全部', ...Array.from(vendors).sort()]
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

    // 性能监控
    const performance = ref({
        tokensPerSecond: 0,
        totalTokens: 0,
        generationTime: 0,
        lastUpdated: 0,
    })

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

    // 生成回复 (支持 JSON Mode 和 Seed)
    async function chat(
        messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
        options?: {
            temperature?: number
            maxTokens?: number
            onStream?: (text: string) => void
            jsonMode?: boolean  // JSON 结构化输出
            seed?: number       // 可复现种子
        }
    ): Promise<string> {
        if (!engine.value || !isModelLoaded.value) {
            throw new Error('模型未加载')
        }

        const {
            temperature = 0.7,
            maxTokens = 1024,
            onStream,
            jsonMode = false,
            seed
        } = options || {}

        // 构建请求参数
        const requestParams: any = {
            messages,
            temperature,
            max_tokens: maxTokens,
        }

        // 添加 JSON Mode
        if (jsonMode) {
            requestParams.response_format = { type: 'json_object' }
        }

        // 添加 Seed
        if (seed !== undefined) {
            requestParams.seed = seed
        }

        try {
            const startTime = Date.now()
            let tokenCount = 0

            if (onStream) {
                // 流式输出
                let fullResponse = ''
                const asyncChunkGenerator = await engine.value.chat.completions.create({
                    ...requestParams,
                    stream: true as const,
                    stream_options: { include_usage: true },
                })

                for await (const chunk of asyncChunkGenerator) {
                    const delta = chunk.choices[0]?.delta?.content || ''
                    fullResponse += delta
                    onStream(fullResponse)

                    // 获取 token 使用量
                    if (chunk.usage) {
                        tokenCount = chunk.usage.completion_tokens || 0
                    }
                }

                // 更新性能数据
                const elapsed = (Date.now() - startTime) / 1000
                performance.value = {
                    tokensPerSecond: tokenCount > 0 ? Math.round(tokenCount / elapsed) : 0,
                    totalTokens: tokenCount,
                    generationTime: elapsed,
                    lastUpdated: Date.now(),
                }

                return fullResponse
            } else {
                // 非流式
                const response = await engine.value.chat.completions.create(requestParams)

                // 更新性能数据
                const elapsed = (Date.now() - startTime) / 1000
                tokenCount = response.usage?.completion_tokens || 0
                performance.value = {
                    tokensPerSecond: tokenCount > 0 ? Math.round(tokenCount / elapsed) : 0,
                    totalTokens: tokenCount,
                    generationTime: elapsed,
                    lastUpdated: Date.now(),
                }

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

    // 谐音识别与映射分析
    async function detectHomophones(content: string): Promise<Array<{
        original: string
        guess: string
        confidence: number
    }>> {
        const systemPrompt = `你是一个专业的网文/同人小说内容分析助手。你的任务是分析文本中的"隐喻、映射、谐音、代称"。
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

如果没有发现任何映射，返回空数组 []。`

        const userPrompt = `请分析以下文本中的映射关系：\n\n${content.slice(0, 3000)}`

        try {
            const response = await chat([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ], {
                temperature: 0.1, // 降低随机性，提高格式稳定性
                jsonMode: true
            })

            let parsed: any = []

            // 解析 JSON
            try {
                // 尝试清理可能的 Markdown 标记
                const cleanJson = response.replace(/```json\s*|\s*```/g, '').trim()
                parsed = JSON.parse(cleanJson)
            } catch {
                // 如果直接解析失败，尝试提取数组
                const jsonMatch = response.match(/\[[\s\S]*\]/)
                if (jsonMatch) {
                    try {
                        parsed = JSON.parse(jsonMatch[0])
                    } catch {
                        parsed = []
                    }
                }
            }

            // 规范化数据结构
            const results = Array.isArray(parsed) ? parsed : (parsed.results || [])

            return results.map((item: any) => {
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

                return {
                    original: String(item.original || '').trim(),
                    guess: String(item.guess || '').trim(),
                    confidence
                }
            }).filter((item: any) =>
                item.original &&
                item.guess &&
                item.original !== item.guess && // 过滤掉无效项
                item.original.length > 0 &&
                item.guess.length > 0
            )

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
        performance, // 性能监控数据

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
