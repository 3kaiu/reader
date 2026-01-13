/**
 * 🕵️ AI Detectors - 检测与分析模块
 * 从 stores/ai.ts 提取的各种识别功能
 */
import { logger } from '../../utils/logger'
import type { HomophoneItem, SlangItem, MemeItem, CharacterGraph } from '../../types/ai'
import { chat } from './chat'
import {
  createHomophonePrompt,
  createSlangPrompt,
  createMemePrompt,
  createCharacterGraphPrompt,
  parseJSONResponse
} from './analysis'
import { engineState } from './engine'

/**
 * 谐音识别与映射分析
 */
export async function detectHomophones(content: string): Promise<HomophoneItem[]> {
  try {
    const prompt = createHomophonePrompt()
    const response = await chat([
      { role: 'system', content: prompt },
      { role: 'user', content: `请分析以下文本中的谐音词：\n\n${content}` }
    ], { jsonMode: true, temperature: 0.3 })

    return parseJSONResponse<HomophoneItem[]>(response, [])
  } catch (e) {
    logger.error('谐音检测失败', e as Error, { function: 'detectHomophones' })
    return []
  }
}

/**
 * AI 降级版本 - 当搜索不可用时使用
 */
export async function detectSlangWithAI(content: string): Promise<SlangItem[]> {
  try {
    const prompt = createSlangPrompt()
    const response = await chat([
      { role: 'system', content: prompt },
      { role: 'user', content: `请识别以下内容中的术语：\n\n${content}` }
    ], { jsonMode: true, temperature: 0.4 })

    const results = parseJSONResponse<SlangItem[]>(response, [])
    return results.map(r => ({ ...r, source: 'local' as const }))
  } catch (e) {
    logger.error('AI黑话检测失败', e as Error, { function: 'detectSlangWithAI' })
    return []
  }
}

/**
 * 搜索增强 - 黑话/行话检测 (带缓存)
 * 注意: 后端无对应搜索端点，直接使用 AI 版本
 */
export async function detectSlang(content: string): Promise<SlangItem[]> {
  // 后端无 /search/term 等端点，直接使用 AI 降级版本
  if (engineState.isModelLoaded.value) {
    return detectSlangWithAI(content)
  }
  return []
}

/**
 * AI 降级版本 - 梗典识别
 */
export async function detectMemesWithAI(content: string): Promise<MemeItem[]> {
  try {
    const prompt = createMemePrompt()
    const response = await chat([
      { role: 'system', content: prompt },
      { role: 'user', content: `请识别以下内容中的梗：\n\n${content}` }
    ], { jsonMode: true, temperature: 0.4 })

    const results = parseJSONResponse<MemeItem[]>(response, [])
    return results.map(r => ({ ...r, source: 'local' as const }))
  } catch (e) {
    logger.error('AI梗典识别失败', e as Error, { function: 'detectMemesWithAI' })
    return []
  }
}

/**
 * 搜索增强 - 梗典识别 (带缓存)
 * 注意: 后端无对应搜索端点，直接使用 AI 版本
 */
export async function detectMemes(content: string): Promise<MemeItem[]> {
  // 后端无 /search/term 等端点，直接使用 AI 降级版本
  if (engineState.isModelLoaded.value) {
    return detectMemesWithAI(content)
  }
  return []
}

/**
 * 构建角色关系图谱
 */
export async function buildCharacterGraph(content: string): Promise<CharacterGraph> {
  try {
    const prompt = createCharacterGraphPrompt()
    const response = await chat([
      { role: 'system', content: prompt },
      { role: 'user', content: `请分析以下文本中的人物关系：\n\n${content}` }
    ], { jsonMode: true, temperature: 0.3 })

    return parseJSONResponse<CharacterGraph>(response, { nodes: [], edges: [] })
  } catch (e) {
    logger.error('构建角色图谱失败', e as Error, { function: 'buildCharacterGraph' })
    return { nodes: [], edges: [] }
  }
}
