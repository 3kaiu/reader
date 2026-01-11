/**
 * 语义搜索 Cloudflare Worker
 * 使用 Cloudflare Workers AI 实现自然语言搜索功能
 */

// 语义搜索配置
const SEMANTIC_SEARCH_CONFIG = {
  // 使用 Cloudflare Workers AI 的文本嵌入模型
  embeddingModel: '@cf/baai/bge-base-en-v1.5',
  // 搜索相似度阈值
  similarityThreshold: 0.7,
  // 最大返回结果数
  maxResults: 20,
  // 缓存TTL (秒)
  cacheTTL: 3600
}

// 内容索引结构
class SemanticIndex {
  constructor(env) {
    this.env = env
    this.kv = env.NEXUS_KV
  }

  // 为内容生成嵌入向量
  async generateEmbedding(text) {
    try {
      const response = await this.env.AI.run(SEMANTIC_SEARCH_CONFIG.embeddingModel, {
        text: text
      })
      return response.data[0] // 返回嵌入向量
    } catch (error) {
      console.error('生成嵌入向量失败:', error)
      throw new Error('嵌入向量生成失败')
    }
  }

  // 索引小说内容
  async indexNovel(novel) {
    const indexKey = `semantic_index:novel:${novel.id}`
    
    // 创建搜索文本 (标题 + 作者 + 描述 + 标签)
    const searchText = [
      novel.title,
      novel.author,
      novel.description,
      ...(novel.aiTags || [])
    ].filter(Boolean).join(' ')

    // 生成嵌入向量
    const embedding = await this.generateEmbedding(searchText)

    // 存储索引数据
    const indexData = {
      id: novel.id,
      title: novel.title,
      author: novel.author,
      description: novel.description,
      aiTags: novel.aiTags || [],
      embedding: embedding,
      lastUpdated: Date.now()
    }

    await this.kv.put(indexKey, JSON.stringify(indexData), {
      expirationTtl: SEMANTIC_SEARCH_CONFIG.cacheTTL * 24 // 24小时缓存
    })

    return indexData
  }

  // 索引章节内容
  async indexChapter(novelId, chapter) {
    const indexKey = `semantic_index:chapter:${novelId}:${chapter.id}`
    
    // 创建搜索文本 (标题 + 内容摘要)
    const contentSummary = chapter.content.substring(0, 500) // 取前500字符作为摘要
    const searchText = `${chapter.title} ${contentSummary}`

    // 生成嵌入向量
    const embedding = await this.generateEmbedding(searchText)

    // 存储索引数据
    const indexData = {
      novelId: novelId,
      chapterId: chapter.id,
      title: chapter.title,
      summary: contentSummary,
      embedding: embedding,
      lastUpdated: Date.now()
    }

    await this.kv.put(indexKey, JSON.stringify(indexData), {
      expirationTtl: SEMANTIC_SEARCH_CONFIG.cacheTTL * 24
    })

    return indexData
  }

  // 计算余弦相似度
  cosineSimilarity(vecA, vecB) {
    if (vecA.length !== vecB.length) {
      throw new Error('向量维度不匹配')
    }

    let dotProduct = 0
    let normA = 0
    let normB = 0

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i]
      normA += vecA[i] * vecA[i]
      normB += vecB[i] * vecB[i]
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
  }

  // 语义搜索
  async search(query, type = 'all') {
    try {
      // 生成查询嵌入向量
      const queryEmbedding = await this.generateEmbedding(query)

      // 获取所有索引
      const results = []
      const prefix = type === 'novels' ? 'semantic_index:novel:' : 
                   type === 'chapters' ? 'semantic_index:chapter:' : 
                   'semantic_index:'

      // 从KV存储获取索引数据
      const { keys } = await this.kv.list({ prefix })
      
      for (const key of keys) {
        const indexData = await this.kv.get(key.name)
        if (!indexData) continue

        const data = JSON.parse(indexData)
        
        // 计算相似度
        const similarity = this.cosineSimilarity(queryEmbedding, data.embedding)
        
        // 过滤低相似度结果
        if (similarity >= SEMANTIC_SEARCH_CONFIG.similarityThreshold) {
          results.push({
            ...data,
            similarity: similarity,
            type: key.name.includes(':novel:') ? 'novel' : 'chapter'
          })
        }
      }

      // 按相似度排序并限制结果数量
      return results
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, SEMANTIC_SEARCH_CONFIG.maxResults)

    } catch (error) {
      console.error('语义搜索失败:', error)
      throw new Error('语义搜索执行失败')
    }
  }
}

// 查询理解和扩展
class QueryProcessor {
  constructor(env) {
    this.env = env
  }

  // 使用AI理解查询意图
  async processQuery(query) {
    try {
      const prompt = `
分析以下搜索查询，提取关键信息：
查询: "${query}"

请提供：
1. 主要关键词
2. 搜索意图 (寻找小说、章节、作者等)
3. 情感倾向 (正面、负面、中性)
4. 相关同义词

以JSON格式返回结果。
`

      const response = await this.env.AI.run('@cf/meta/llama-2-7b-chat-int8', {
        messages: [{ role: 'user', content: prompt }]
      })

      // 解析AI响应
      try {
        const analysis = JSON.parse(response.response)
        return {
          originalQuery: query,
          keywords: analysis.keywords || [query],
          intent: analysis.intent || 'general',
          sentiment: analysis.sentiment || 'neutral',
          synonyms: analysis.synonyms || []
        }
      } catch (parseError) {
        // 如果AI响应无法解析，返回基本分析
        return {
          originalQuery: query,
          keywords: [query],
          intent: 'general',
          sentiment: 'neutral',
          synonyms: []
        }
      }

    } catch (error) {
      console.error('查询处理失败:', error)
      // 返回基本查询处理
      return {
        originalQuery: query,
        keywords: [query],
        intent: 'general',
        sentiment: 'neutral',
        synonyms: []
      }
    }
  }
}

// 主要处理函数
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const path = url.pathname

    // CORS 头部
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }

    // 处理 OPTIONS 请求
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders })
    }

    try {
      const semanticIndex = new SemanticIndex(env)
      const queryProcessor = new QueryProcessor(env)

      // 路由处理
      switch (path) {
        case '/semantic-search':
          return await handleSemanticSearch(request, semanticIndex, queryProcessor, corsHeaders)
        
        case '/index-novel':
          return await handleIndexNovel(request, semanticIndex, corsHeaders)
        
        case '/index-chapter':
          return await handleIndexChapter(request, semanticIndex, corsHeaders)
        
        case '/health':
          return new Response(JSON.stringify({ status: 'ok', timestamp: Date.now() }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        
        default:
          return new Response('Not Found', { status: 404, headers: corsHeaders })
      }

    } catch (error) {
      console.error('Worker错误:', error)
      return new Response(JSON.stringify({ 
        error: '内部服务器错误',
        message: error.message 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
  }
}

// 处理语义搜索请求
async function handleSemanticSearch(request, semanticIndex, queryProcessor, corsHeaders) {
  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders })
  }

  const url = new URL(request.url)
  const query = url.searchParams.get('q')
  const type = url.searchParams.get('type') || 'all'

  if (!query) {
    return new Response(JSON.stringify({ error: '缺少查询参数' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  try {
    // 处理查询
    const queryAnalysis = await queryProcessor.processQuery(query)
    
    // 执行语义搜索
    const searchResults = await semanticIndex.search(query, type)

    const response = {
      query: queryAnalysis,
      results: searchResults,
      total: searchResults.length,
      timestamp: Date.now()
    }

    return new Response(JSON.stringify(response), {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300' // 5分钟缓存
      }
    })

  } catch (error) {
    console.error('语义搜索处理失败:', error)
    return new Response(JSON.stringify({ 
      error: '搜索失败',
      message: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
}

// 处理小说索引请求
async function handleIndexNovel(request, semanticIndex, corsHeaders) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders })
  }

  try {
    const novel = await request.json()
    
    if (!novel.id || !novel.title) {
      return new Response(JSON.stringify({ error: '缺少必要的小说信息' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const indexData = await semanticIndex.indexNovel(novel)

    return new Response(JSON.stringify({ 
      success: true,
      indexed: indexData.id,
      timestamp: indexData.lastUpdated
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('小说索引失败:', error)
    return new Response(JSON.stringify({ 
      error: '索引失败',
      message: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
}

// 处理章节索引请求
async function handleIndexChapter(request, semanticIndex, corsHeaders) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders })
  }

  try {
    const { novelId, chapter } = await request.json()
    
    if (!novelId || !chapter || !chapter.id) {
      return new Response(JSON.stringify({ error: '缺少必要的章节信息' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const indexData = await semanticIndex.indexChapter(novelId, chapter)

    return new Response(JSON.stringify({ 
      success: true,
      indexed: `${novelId}:${chapter.id}`,
      timestamp: indexData.lastUpdated
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('章节索引失败:', error)
    return new Response(JSON.stringify({ 
      error: '索引失败',
      message: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
}