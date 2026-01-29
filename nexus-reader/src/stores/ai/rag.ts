/**
 * 📚 RAG-lite v2 - 混和檢索增強生成
 * 支持 BM25 關鍵字與 WebGPU 語義向量雙重檢索
 */
import { ref } from 'vue'
import { embed, cosineSimilarity } from '../../composables/useEmbedding'

export interface RagDocument {
  id: string
  content: string
  metadata: Record<string, any>
  vector?: number[]
}

export function useRag() {
  const documents = ref<RagDocument[]>([])

  /**
   * 添加文檔並異步生成向量
   */
  async function addDocuments(docs: RagDocument[]) {
    // 先添加純文本，確保快速響應
    documents.value.push(...docs)

    // 異步生成向量 (WebGPU)
    for (const doc of docs) {
      if (!doc.vector) {
        try {
          // 只取前 500 字符生成語義向量，節省計算
          doc.vector = await embed(doc.content.slice(0, 500))
        } catch (e) {
          console.warn('[RAG] 向量生成失敗:', e)
        }
      }
    }
  }

  /**
   * 清空文檔
   */
  function clear() {
    documents.value = []
  }

  /**
   * 混和檢索 (Hybrid Search)
   */
  async function search(query: string, limit = 3): Promise<RagDocument[]> {
    if (documents.value.length === 0) return []

    // 1. 生成加密查詢向量
    let queryVector: number[] | null = null
    try {
      queryVector = await embed(query)
    } catch (e) {
      console.warn('[RAG] 查詢向量生成失敗，回退到純文本檢索')
    }

    // 性能優化：預分詞並過濾無效词
    const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 0)

    // 性能優化：預編譯聚合正則，避免在循環中重複創建 RegExp 對象
    const queryRegex = tokens.length > 0
      ? new RegExp(tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi')
      : null

    const scores = documents.value.map(doc => {
      let bm25Score = 0
      let semanticScore = 0

      // BM25 關鍵字得分 (優化版：一次掃描)
      if (queryRegex) {
        const content = doc.content
        const matches = content.match(queryRegex)
        if (matches) {
          // 簡單模擬計分：匹配項總數 * 加權
          bm25Score = matches.length * 1.5
        }
      }

      // 語義相似度得分
      if (queryVector && doc.vector) {
        semanticScore = cosineSimilarity(queryVector, doc.vector)
      }

      // 權重融合 (0.3 BM25 + 0.7 Semantic)
      const normalizedBm25 = Math.min(bm25Score / 10, 1)
      const finalScore = (normalizedBm25 * 0.3) + (semanticScore * 0.7)

      return { doc, score: finalScore }
    })

    return scores
      .filter(s => s.score > 0.1) // 過濾低相關度
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => s.doc)
  }

  /**
   * 生成上下文 Prompt
   */
  async function generateContextPrompt(query: string): Promise<string> {
    const results = await search(query)
    if (results.length === 0) return ""

    let prompt = "\n\n相關背景信息：\n"
    results.forEach((res, i) => {
      prompt += `[資訊 ${i + 1}] (${res.metadata.title || ''}): ${res.content}\n`
    })
    return prompt
  }

  return {
    documents,
    addDocuments,
    clear,
    search,
    generateContextPrompt
  }
}
