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
 */
export async function detectSlang(content: string): Promise<SlangItem[]> {
  const { searchApi } = await import('../../api/search')
  const { extractCandidateTerms } = await import('../../utils/termExtractor')
  const { getCachedBatch, setCacheBatch } = await import('../searchCache')

  const candidates = extractCandidateTerms(content, { maxTerms: 10 })
  if (candidates.length === 0) return []

  try {
    const cached = await getCachedBatch(candidates)
    const uncachedTerms = candidates.filter(t => !cached.has(t))

    const cachedResults: SlangItem[] = []
    cached.forEach((result) => {
      if (result.meaning) {
        cachedResults.push({
          term: result.term,
          meaning: result.meaning,
          category: result.category as SlangItem['category'],
          source: 'cache' as const
        })
      }
    })

    let apiResults: SlangItem[] = []
    if (uncachedTerms.length > 0) {
      const response = await searchApi.searchBatch(uncachedTerms, 'slang')
      const validResults = response.results.filter(r => r.meaning && r.source !== 'none')
      if (validResults.length > 0) {
        await setCacheBatch(validResults)
      }

      apiResults = validResults.map(r => ({
        term: r.term,
        meaning: r.meaning,
        category: r.category as SlangItem['category'],
        source: r.source as SlangItem['source']
      }))
    }

    return [...cachedResults, ...apiResults]
  } catch (e) {
    logger.error('黑话检测执行失败', e as Error, { function: 'detectSlang' })
    if (engineState.isModelLoaded.value) {
      return detectSlangWithAI(content)
    }
    return []
  }
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
 */
export async function detectMemes(content: string): Promise<MemeItem[]> {
  const { searchApi } = await import('../../api/search')
  const { extractQuotedTerms } = await import('../../utils/termExtractor')
  const { getCachedBatch, setCacheBatch } = await import('../searchCache')

  const candidates = extractQuotedTerms(content, 10)
  if (candidates.length === 0) {
    if (engineState.isModelLoaded.value) return detectMemesWithAI(content)
    return []
  }

  try {
    const cached = await getCachedBatch(candidates)
    const uncachedTerms = candidates.filter(t => !cached.has(t))

    const cachedResults: MemeItem[] = []
    cached.forEach((result) => {
      if (result.meaning) {
        cachedResults.push({
          reference: result.term,
          origin: result.category || '网络',
          explanation: result.meaning,
          source: 'cache' as const
        })
      }
    })

    let apiResults: MemeItem[] = []
    if (uncachedTerms.length > 0) {
      const response = await searchApi.searchBatch(uncachedTerms, 'meme')
      const validResults = response.results.filter(r => r.meaning && r.source !== 'none')
      if (validResults.length > 0) {
        await setCacheBatch(validResults)
      }

      apiResults = validResults.map(r => ({
        reference: r.term,
        origin: r.related?.[0] || '网络',
        explanation: r.meaning,
        source: r.source as 'local' | 'search'
      }))
    }

    const searchResults = [...cachedResults, ...apiResults]
    if (searchResults.length === 0 && engineState.isModelLoaded.value) {
      return detectMemesWithAI(content)
    }

    return searchResults
  } catch (e) {
    if (engineState.isModelLoaded.value) return detectMemesWithAI(content)
    return []
  }
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
