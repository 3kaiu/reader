/**
 * 📚 RAG-lite v2 - 混和檢索增強生成
 * 支持 BM25 關鍵字與 WebGPU 語義向量雙重檢索
 */
import { ref } from 'vue'
import { embed, cosineSimilarity } from '../../composables/useEmbedding'
import { nexusDB, StoreNames } from '../../utils/db'
import { hardwareScheduler } from '../../services/hardware/scheduler'

export interface RagDocument {
  id: string
  content: string
  metadata: Record<string, any>
  vector?: number[]
}

export function useRag() {
  const documents = ref<RagDocument[]>([])

  /**
   * 添加文檔并实现滑动窗口分块 (Sliding Window Chunking)
   */
  async function addDocuments(docs: RagDocument[]) {
    const quota = hardwareScheduler.getQuota()
    const chunkedDocs: RagDocument[] = []

    for (const doc of docs) {
      if (doc.content.length <= 1200) {
        chunkedDocs.push(doc)
      } else {
        const windowSize = 1000
        const overlap = 150
        let start = 0
        let chunkIdx = 0

        while (start < doc.content.length) {
          const end = Math.min(start + windowSize, doc.content.length)
          chunkedDocs.push({
            ...doc,
            id: `${doc.id}_chunk_${chunkIdx++}`,
            content: doc.content.substring(start, end),
            metadata: { ...doc.metadata, is_chunk: true, chunk_index: chunkIdx }
          })

          if (end === doc.content.length) break
          start += (windowSize - overlap)
        }
      }
    }

    // 持久化存储
    for (const chunk of chunkedDocs) {
      await nexusDB.put(StoreNames.PROGRESS, { id: `rag_doc_${chunk.id}`, data: chunk })
      await updateInvertedIndex(chunk)
    }

    documents.value.push(...chunkedDocs)

    // 异步生成向量 (由硬件配额决定)
    if (quota.allowVectorization) {
      for (const doc of chunkedDocs) {
        if (!doc.vector) {
          try {
            doc.vector = await embed(doc.content)
            await nexusDB.put(StoreNames.PROGRESS, { id: `rag_doc_${doc.id}`, data: doc })
          } catch (e) {
            console.warn('[RAG] Vectorization failed', e)
          }
        }
      }
    }
  }

  async function updateInvertedIndex(doc: RagDocument) {
    const tokens = tokenize(doc.content)
    for (const token of tokens) {
      const key = `rag_idx_${token}`
      const existing: any = await nexusDB.get(StoreNames.RULES, key)
      const docIds = existing ? [...existing.docIds, doc.id] : [doc.id]
      await nexusDB.put(StoreNames.RULES, { id: key, docIds: Array.from(new Set(docIds)) })
    }
  }

  function tokenize(text: string): string[] {
    return text.toLowerCase().split(/[^\w\u4e00-\u9fa5]+/).filter(t => t.length > 1)
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
  async function search(query: string, limit = 5): Promise<RagDocument[]> {
    const tokens = tokenize(query)
    if (tokens.length === 0) return []

    // 1. 索引检索候选集
    const candidateIds = new Set<string>()
    for (const token of tokens) {
      const entry: any = await nexusDB.get(StoreNames.RULES, `rag_idx_${token}`)
      if (entry) {
        entry.docIds.forEach((id: string) => candidateIds.add(id))
      }
    }

    if (candidateIds.size === 0) return []

    // 2. 加载候选文档并打分
    const candidates: RagDocument[] = []
    for (const id of candidateIds) {
      const stored: any = await nexusDB.get(StoreNames.PROGRESS, `rag_doc_${id}`)
      if (stored) candidates.push(stored.data)
    }

    const queryVector = await (async () => {
      try { return await embed(query) } catch { return null }
    })()

    const scores = candidates.map(doc => {
      let bm25Score = 0
      tokens.forEach(t => {
        if (doc.content.toLowerCase().includes(t)) bm25Score += 1
      })

      const semanticScore = queryVector && doc.vector ? cosineSimilarity(queryVector, doc.vector) : 0
      const finalScore = (Math.min(bm25Score / 5, 1) * 0.3) + (semanticScore * 0.7)
      return { doc, score: finalScore }
    })

    return scores
      .filter(s => s.score > 0.1)
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
