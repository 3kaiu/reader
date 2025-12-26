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

// 动态获取推荐模型（精选最优模型）
export function getRecommendedModels() {
    try {
        const modelList = webllm.prebuiltAppConfig.model_list
        if (!modelList || !Array.isArray(modelList)) {
            return []
        }
        
        // 推荐模型标准（优先 3B，附加同系列 7B/8B，中文友好）：
        // 1. 参数量：1B / 1.5B / 2B / 3B / 7B / 8B
        // 2. 量化：Q4
        // 3. VRAM：< 7GB（允许 7B/8B Q4 端侧运行）
        // 4. 主流系列：Qwen 2.5、Llama 3.2（中文表现较好）
        // 5. 优先 3B（轻量），可附加 7B/8B（重型），都优先 q4f16
        const candidates = modelList
            .filter((m: any) => {
                const id = m.model_id.toLowerCase()
                const vram = m.vram_required_MB || 0

                // 剔除专用途径模型（代码 / 数学 / 视觉 / 嵌入 等）
                if (
                    id.includes('coder') ||
                    id.includes('code') ||
                    id.includes('math') ||
                    id.includes('vision') ||
                    id.includes('vl') ||
                    id.includes('embed') ||
                    id.includes('embedding')
                ) {
                    return false
                }
                
                // 模型大小检查：1B / 1.5B / 2B / 3B / 7B / 8B
                const isSmall = (
                    (id.includes('1b') || 
                     id.includes('1.5b') || 
                     id.includes('2b') ||
                     id.includes('3b') ||
                     id.includes('7b') ||
                     id.includes('8b'))
                )
                
                // Q4量化检查
                const isQ4 = id.includes('q4')
                
                // VRAM需求检查（小于7GB，兼顾 3B 与 7B/8B Q4）
                const isLowVRAM = vram < 7000
                
                // 主流系列检查（只选择对中文友好的模型）
                // 优先选择 Qwen（中文优化），其次选择 Llama 3.2（对中文支持较好）
                const isMainstream = 
                    (id.includes('qwen2.5') && !id.includes('coder') && !id.includes('math')) ||
                    (id.includes('llama-3.2'))
                
                return isSmall && isQ4 && isLowVRAM && isMainstream
            })
            .map((m: any) => {
                const id = m.model_id.toLowerCase()
                const vram = m.vram_required_MB || 0
                // rank 越小越优先：3B > 2B > 1.5B > 1B > 7B > 8B
                let rank = 10
                if (id.includes('3b')) rank = 0
                else if (id.includes('2b')) rank = 1
                else if (id.includes('1.5b')) rank = 2
                else if (id.includes('1b')) rank = 3
                else if (id.includes('7b')) rank = 4
                else if (id.includes('8b')) rank = 5

                return {
                    id: m.model_id,
                    vram,
                    isQ4F16: id.includes('q4f16'),
                    rank,
                }
            })
        
        // 按系列分组，每个系列选择最优的1-2个模型
        const seriesGroups: Record<string, typeof candidates> = {}
        
        candidates.forEach((model) => {
            const id = model.id.toLowerCase()
            let series = 'other'
            
            if (id.includes('qwen2.5')) series = 'qwen'
            else if (id.includes('llama-3.2')) series = 'llama-3.2'
            else if (id.includes('llama-3.1')) series = 'llama-3.1'
            
            if (!seriesGroups[series]) {
                seriesGroups[series] = []
            }
            seriesGroups[series].push(model)
        })
        
        // 从每个系列中选择最优模型（优先 q4f16，然后按 VRAM 排序）
        const recommended: string[] = []
        
        Object.values(seriesGroups).forEach((group) => {
            // 按 rank -> q4f16 -> VRAM 从小到大排序
            const sorted = group.sort((a, b) => {
                if (a.rank !== b.rank) {
                    return a.rank - b.rank
                }
                if (a.isQ4F16 !== b.isQ4F16) {
                    return a.isQ4F16 ? -1 : 1
                }
                return a.vram - b.vram
            })

            // 轻量优先：选一个 rank <= 3 的（最多 3B/2B/1.5B/1B）
            const light = sorted.find(m => m.rank <= 3)
            if (light) {
                recommended.push(light.id)
            }

            // 如果有更大模型（7B/8B），再附加一个重型选项
            const heavy = sorted.find(m => m.rank >= 4)
            if (heavy) {
                recommended.push(heavy.id)
            }
        })
        
        return recommended
    } catch {
        // 如果无法获取模型列表（可能不支持WebGPU），返回空数组
        return []
    }
}

// 保持向后兼容的导出（用于其他地方引用）
export const RECOMMENDED_MODELS = []

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

    // 解析参数量（更全面的匹配）
    let params = 0
    // 匹配各种参数量格式（按从大到小顺序，避免误匹配）
    if (id.includes('70b')) params = 70
    else if (id.includes('13b')) params = 13
    else if (id.includes('8b')) params = 8
    else if (id.includes('7b')) params = 7
    else if (id.includes('3b')) params = 3
    else if (id.includes('2b')) params = 2
    else if (id.includes('1.5b') || id.includes('1.5-b')) params = 1.5
    else if (id.includes('1b') && !id.includes('1.5')) params = 1
    else if (id.includes('0.5b') || id.includes('500m')) params = 0.5

    // 解析量化方式
    let ratio = 1
    if (id.includes('q4f16') || id.includes('q4f32') || id.includes('q4')) {
        ratio = 0.5
    } else if (id.includes('q8f16') || id.includes('q8f32') || id.includes('q8')) {
        ratio = 0.75
    } else if (id.includes('q0f16') || id.includes('q0f32')) {
        ratio = 2
    } else if (id.includes('f16') || id.includes('f32')) {
        ratio = 2
    }

    if (params === 0) return '未知'

    const sizeMB = Math.round(params * 1000 * ratio)
    if (sizeMB >= 1000) {
        return `~${(sizeMB / 1000).toFixed(1)}GB`
    }
    return `~${sizeMB}MB`
}

// 从模型ID解析量化方式
function getQuantization(modelId: string): string {
    const id = modelId.toLowerCase()
    if (id.includes('q4f16') || id.includes('q4f32')) return 'Q4'
    if (id.includes('q8f16') || id.includes('q8f32')) return 'Q8'
    if (id.includes('q0f16') || id.includes('q0f32')) return 'FP16'
    return '未知'
}

// 从模型ID解析参数量
function getParams(modelId: string): string {
    const id = modelId.toLowerCase()
    
    // 更精确的参数量匹配（按从大到小顺序，避免误匹配）
    if (id.includes('70b')) return '70B'
    if (id.includes('13b')) return '13B'
    if (id.includes('8b')) return '8B'
    if (id.includes('7b')) return '7B'
    if (id.includes('3b')) return '3B'
    if (id.includes('2b')) return '2B'
    if (id.includes('1.5b') || id.includes('1.5-b')) return '1.5B'
    if (id.includes('1b') && !id.includes('1.5')) return '1B'
    if (id.includes('0.5b') || id.includes('500m')) return '0.5B'
    
    return '未知'
}

// 获取所有可用模型（带厂商和大小）
export function getAllModels() {
    try {
        const modelList = webllm.prebuiltAppConfig.model_list
        if (!modelList || !Array.isArray(modelList)) {
            return []
        }
        
        const recommendedIds = new Set(getRecommendedModels())
        
        // 映射并过滤模型
        return modelList
            .map((m: any) => {
                const id = m.model_id
                if (!id || typeof id !== 'string') {
                    return null
                }
                
                // 尝试从model对象中获取context_window，如果没有则使用默认值
                const contextWindow = m.context_window || 4096
                
                // 解析模型系列（取第一个单词，处理大小写）
                const seriesParts = id.split('-')
                const series = seriesParts[0] || 'Unknown'
                
                // 计算模型信息
                const size = estimateSize(id)
                const vendor = getVendor(id)
                const params = getParams(id)
                const quantization = getQuantization(id)
                
                return {
                    id,
                    name: id.split('-').slice(0, 3).join(' '),
                    fullName: id,
                    size,
                    vendor,
                    description: id,
                    recommended: recommendedIds.has(id), // 使用 web-llm 的 low_resource_required 标记
                    quantization,
                    params,
                    contextWindow: contextWindow,
                    series, // 模型系列（如 Qwen, Llama, Phi 等）
                }
            })
            .filter((model: any) => {
                // 过滤条件：
                // 1. 模型对象必须存在
                // 2. 厂商不能是"其他"（未知厂商）
                // 3. 大小不能是"未知"
                // 4. 参数量不能是"未知"
                // 5. 移除对中文不友好的模型
                if (!model) return false
                if (model.vendor === '其他') return false
                if (model.size === '未知') return false
                if (model.params === '未知') return false
                
                // 中文支持过滤：移除对中文不友好的模型系列
                const id = model.id.toLowerCase()
                // 保留：Qwen（中文优化）、Llama（较新版本对中文支持有所改善）
                // 移除：Gemma（Google，主要针对英文）、Phi（Microsoft，主要针对英文）
                // 移除：其他对中文支持较差的模型
                const isChineseUnfriendly = 
                    id.includes('gemma') ||           // Google Gemma，主要针对英文
                    id.includes('phi') ||              // Microsoft Phi，主要针对英文
                    id.includes('mistral') ||          // Mistral AI，主要针对英文
                    id.includes('smollm') ||           // SmolLM，主要针对英文
                    id.includes('stablelm') ||         // StableLM，主要针对英文
                    id.includes('redpajama') ||        // RedPajama，主要针对英文
                    id.includes('wizardmath') ||       // WizardMath，主要针对数学和英文
                    (id.includes('llama') && !id.includes('llama-3.2') && !id.includes('llama-3.1')) // 只保留 Llama 3.1+ 和 3.2（较新版本对中文支持更好）
                
                if (isChineseUnfriendly) return false

                // 移除专用途径模型（coder / math / vision 等）
                const isSpecialized =
                    id.includes('coder') ||    // 代码模型
                    id.includes('code') ||     // 泛代码模型
                    id.includes('math') ||     // 数学推理模型
                    id.includes('vision') ||   // 视觉模型
                    id.includes('vl')          // 多模态视觉语言

                if (isSpecialized) return false
                
                return true
            })
    } catch {
        // 如果无法获取模型列表（可能不支持WebGPU），返回空数组
        return []
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
        const saved = localStorage.getItem(STORAGE_KEY)
        if (saved) {
            // 验证保存的模型是否可用
            const availableModels = getAllModels()
            if (availableModels.some(m => m.id === saved)) {
                return saved
            }
        }
        // 如果没有保存的或保存的不可用，使用第一个推荐的模型
        const recommended = getRecommendedModels()
        if (recommended.length > 0) {
            return recommended[0] // getRecommendedModels() 现在返回字符串数组
        }
        // 如果连推荐模型都没有，使用第一个可用模型
        const availableModels = getAllModels()
        if (availableModels.length > 0) {
            return availableModels[0].id
        }
        return 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC' // 兜底
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
            topP?: number
            maxTokens?: number
            onStream?: (text: string) => void
            jsonMode?: boolean  // JSON 结构化输出
            seed?: number       // 可复现种子
            presencePenalty?: number  // 话题新鲜度
            frequencyPenalty?: number  // 频率惩罚度
        }
    ): Promise<string> {
        if (!engine.value || !isModelLoaded.value) {
            throw new Error('模型未加载')
        }

        // 从settings store获取默认参数（如果可用）
        let defaultTemperature = 0.7
        let defaultTopP = 0.9
        let defaultMaxTokens = 2048
        let defaultPresencePenalty = 0.0
        let defaultFrequencyPenalty = 0.0

        try {
            const { useSettingsStore } = await import('./settings')
            const settingsStore = useSettingsStore()
            defaultTemperature = settingsStore.config.aiParams.temperature
            defaultTopP = settingsStore.config.aiParams.topP
            defaultMaxTokens = settingsStore.config.aiParams.maxTokens
            defaultPresencePenalty = settingsStore.config.aiParams.presencePenalty
            defaultFrequencyPenalty = settingsStore.config.aiParams.frequencyPenalty
        } catch {
            // 如果无法导入settings store，使用默认值
        }

        const {
            temperature = defaultTemperature,
            topP = defaultTopP,
            maxTokens = defaultMaxTokens,
            onStream,
            jsonMode = false,
            seed,
            presencePenalty = defaultPresencePenalty,
            frequencyPenalty = defaultFrequencyPenalty,
        } = options || {}

        // 构建请求参数
        const requestParams: any = {
            messages,
            temperature,
            top_p: topP,
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

        // 添加 Penalty 参数（如果模型支持）
        if (presencePenalty !== 0) {
            requestParams.presence_penalty = presencePenalty
        }
        if (frequencyPenalty !== 0) {
            requestParams.frequency_penalty = frequencyPenalty
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
