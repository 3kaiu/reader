/**
 * 🤖 AI Models - 模型元数据与推荐逻辑
 * 从 stores/ai.ts 提取的模型相关工具函数
 */
import * as webllm from '@mlc-ai/web-llm'
import { AI_MAX_VRAM_MB, AI_DEFAULT_CONTEXT_WINDOW } from '../../constants/ai'
import type { WebLLMModelConfig, ModelCandidate, ModelInfo } from '../../types/ai'

// ==================== 模型厂商映射 ====================

export const MODEL_VENDORS: Record<string, string> = {
    Qwen: '阿里 Qwen',
    Llama: 'Meta Llama',
    Phi: 'Microsoft Phi',
    Gemma: 'Google Gemma',
    Mistral: 'Mistral AI',
    SmolLM: 'HuggingFace',
    TinyLlama: 'TinyLlama',
    RedPajama: 'Together AI',
    Hermes: 'NousResearch',
    WizardMath: 'WizardLM',
    stablelm: 'Stability AI',
}

// ==================== 模型解析工具 ====================

/** 从模型 ID 解析厂商 */
export function getVendor(modelId: string): string {
    for (const [key, value] of Object.entries(MODEL_VENDORS)) {
        if (modelId.toLowerCase().includes(key.toLowerCase())) {
            return value
        }
    }
    return '其他'
}

/** 从模型 ID 估算大小 (基于参数量和量化) */
export function estimateSize(modelId: string): string {
    const id = modelId.toLowerCase()

    // 解析参数量
    let params = 0
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
    } else if (id.includes('q0f16') || id.includes('q0f32') || id.includes('f16') || id.includes('f32')) {
        ratio = 2
    }

    if (params === 0) return '未知'

    const sizeMB = Math.round(params * 1000 * ratio)
    if (sizeMB >= 1000) {
        return `~${(sizeMB / 1000).toFixed(1)}GB`
    }
    return `~${sizeMB}MB`
}

/** 从模型ID解析量化方式 */
export function getQuantization(modelId: string): string {
    const id = modelId.toLowerCase()
    if (id.includes('q4f16') || id.includes('q4f32')) return 'Q4'
    if (id.includes('q8f16') || id.includes('q8f32')) return 'Q8'
    if (id.includes('q0f16') || id.includes('q0f32')) return 'FP16'
    return '未知'
}

/** 从模型ID解析参数量 */
export function getParams(modelId: string): string {
    const id = modelId.toLowerCase()
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

// ==================== 推荐模型算法 ====================

/**
 * 动态获取推荐模型（精选最优模型）
 * 推荐标准：参数量 1B-8B，Q4 量化，VRAM < 7GB，中文友好系列
 */
export function getRecommendedModels(): string[] {
    try {
        const modelList = webllm.prebuiltAppConfig.model_list
        if (!modelList || !Array.isArray(modelList)) {
            return []
        }

        const candidates = (modelList as unknown as WebLLMModelConfig[])
            .filter((m) => {
                const id = m.model_id.toLowerCase()
                const vram = m.vram_required_MB || 0

                // 排除专用模型
                if (
                    id.includes('coder') || id.includes('code') ||
                    id.includes('math') || id.includes('vision') ||
                    id.includes('vl') || id.includes('embed')
                ) {
                    return false
                }

                const isSmall = ['1b', '1.5b', '2b', '3b', '7b', '8b'].some(s => id.includes(s))
                const isQ4 = id.includes('q4')
                const isLowVRAM = vram < AI_MAX_VRAM_MB
                const isMainstream =
                    (id.includes('qwen2.5') && !id.includes('coder') && !id.includes('math')) ||
                    id.includes('llama-3.2')

                return isSmall && isQ4 && isLowVRAM && isMainstream
            })
            .map((m): ModelCandidate => {
                const id = m.model_id.toLowerCase()
                let rank = 10
                if (id.includes('3b')) rank = 0
                else if (id.includes('2b')) rank = 1
                else if (id.includes('1.5b')) rank = 2
                else if (id.includes('1b')) rank = 3
                else if (id.includes('7b')) rank = 4
                else if (id.includes('8b')) rank = 5

                return {
                    id: m.model_id,
                    vram: m.vram_required_MB || 0,
                    isQ4F16: id.includes('q4f16'),
                    rank,
                }
            })

        // 按系列分组
        const seriesGroups: Record<string, ModelCandidate[]> = {}
        candidates.forEach((model) => {
            const id = model.id.toLowerCase()
            let series = 'other'
            if (id.includes('qwen2.5')) series = 'qwen'
            else if (id.includes('llama-3.2')) series = 'llama-3.2'
            else if (id.includes('llama-3.1')) series = 'llama-3.1'

            if (!seriesGroups[series]) seriesGroups[series] = []
            seriesGroups[series].push(model)
        })

        // 每个系列选最优
        const recommended: string[] = []
        Object.values(seriesGroups).forEach((group) => {
            const sorted = group.sort((a, b) => {
                if (a.rank !== b.rank) return a.rank - b.rank
                if (a.isQ4F16 !== b.isQ4F16) return a.isQ4F16 ? -1 : 1
                return a.vram - b.vram
            })

            const light = sorted.find((m) => m.rank <= 3)
            if (light) recommended.push(light.id)

            const heavy = sorted.find((m) => m.rank >= 4)
            if (heavy) recommended.push(heavy.id)
        })

        return recommended
    } catch {
        return []
    }
}

// ==================== 模型列表 ====================

/** 获取所有可用模型（带厂商和大小） */
export function getAllModels(): ModelInfo[] {
    try {
        const modelList = webllm.prebuiltAppConfig.model_list
        if (!modelList || !Array.isArray(modelList)) {
            return []
        }

        const recommendedIds = new Set(getRecommendedModels())

        return (modelList as unknown as WebLLMModelConfig[])
            .map((m): ModelInfo | null => {
                const id = m.model_id
                if (!id || typeof id !== 'string') return null

                const contextWindow =
                    (m as { context_window?: number }).context_window || AI_DEFAULT_CONTEXT_WINDOW
                const seriesParts = id.split('-')
                const series = seriesParts[0] || 'Unknown'

                return {
                    id,
                    name: id.split('-').slice(0, 3).join(' '),
                    fullName: id,
                    size: estimateSize(id),
                    vendor: getVendor(id),
                    description: id,
                    recommended: recommendedIds.has(id),
                    quantization: getQuantization(id),
                    params: getParams(id),
                    contextWindow,
                    series,
                }
            })
            .filter((model): model is ModelInfo => {
                if (!model) return false
                if (model.vendor === '其他') return false
                if (model.size === '未知') return false
                if (model.params === '未知') return false

                const id = model.id.toLowerCase()

                // 中文友好过滤
                const isChineseUnfriendly =
                    id.includes('gemma') || id.includes('phi') ||
                    id.includes('mistral') || id.includes('smollm') ||
                    id.includes('stablelm') || id.includes('redpajama') ||
                    id.includes('wizardmath') ||
                    (id.includes('llama') && !id.includes('llama-3.2') && !id.includes('llama-3.1'))

                if (isChineseUnfriendly) return false

                // 排除专用模型
                const isSpecialized =
                    id.includes('coder') || id.includes('code') ||
                    id.includes('math') || id.includes('vision') || id.includes('vl')

                if (isSpecialized) return false

                return true
            })
    } catch {
        return []
    }
}

/** 获取所有厂商列表 */
export function getVendors(): string[] {
    const models = getAllModels()
    const vendors = new Set(models.map((m) => m.vendor))
    return ['全部', ...Array.from(vendors).sort()]
}

// ==================== 模型持久化 ====================

const STORAGE_KEY = 'ai-last-model'
const DEFAULT_MODEL = 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC'

/** 获取默认模型（优先读取本地存储） */
export function getDefaultModel(): string {
    try {
        const saved = localStorage.getItem(STORAGE_KEY)
        if (saved) {
            const availableModels = getAllModels()
            if (availableModels.some((m) => m.id === saved)) {
                return saved
            }
        }
        const recommended = getRecommendedModels()
        if (recommended.length > 0) return recommended[0]

        const availableModels = getAllModels()
        if (availableModels.length > 0) return availableModels[0].id

        return DEFAULT_MODEL
    } catch {
        return DEFAULT_MODEL
    }
}

/** 保存最后使用的模型 */
export function saveLastModel(modelId: string): void {
    try {
        localStorage.setItem(STORAGE_KEY, modelId)
    } catch {
        // 忽略存储错误
    }
}

// 向后兼容导出
export const RECOMMENDED_MODELS: string[] = []
