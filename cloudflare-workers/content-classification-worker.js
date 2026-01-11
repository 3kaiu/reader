/**
 * 内容自动分类 Cloudflare Worker
 * 使用 Cloudflare Workers AI 实现智能内容分析和分类
 */

// 分类配置
const CLASSIFICATION_CONFIG = {
  // AI模型配置
  textClassificationModel: '@cf/huggingface/distilbert-sst-2-int8',
  textGenerationModel: '@cf/meta/llama-2-7b-chat-int8',
  
  // 分类类别定义
  categories: {
    genre: [
      '玄幻', '修仙', '都市', '言情', '科幻', '历史', '军事', '游戏',
      '竞技', '悬疑', '推理', '恐怖', '武侠', '仙侠', '奇幻', '末世',
      '重生', '穿越', '系统', '无限流', '二次元', '轻小说'
    ],
    theme: [
      '爽文', '虐文', '甜文', '搞笑', '热血', '治愈', '励志', '黑暗',
      '轻松', '沉重', '温馨', '刺激', '浪漫', '冒险', '成长', '复仇'
    ],
    target: [
      '男频', '女频', '青少年', '成人', '全年龄', '儿童'
    ],
    status: [
      '连载中', '已完结', '太监', '断更'
    ],
    quality: [
      '精品', '优秀', '良好', '一般', '较差'
    ]
  },
  
  // 批处理配置
  batchSize: 10,
  maxConcurrent: 3,
  retryAttempts: 3,
  
  // 缓存配置
  cacheTTL: 24 * 60 * 60, // 24小时
  
  // AI请求限制 (Cloudflare Workers AI 每日10,000请求)
  dailyRequestLimit: 8000, // 留2000作为缓冲
  requestWindow: 24 * 60 * 60 * 1000 // 24小时窗口
}

// 内容分类器
class ContentClassifier {
  constructor(env) {
    this.env = env
    this.kv = env.NEXUS_KV
    this.ai = env.AI
  }

  // 分析小说内容并生成分类
  async classifyNovel(novel) {
    try {
      // 检查AI请求限制
      await this.checkRequestLimit()
      
      // 准备分析文本
      const analysisText = this.prepareAnalysisText(novel)
      
      // 执行多维度分类
      const classifications = await Promise.all([
        this.classifyGenre(analysisText),
        this.classifyTheme(analysisText),
        this.classifyTarget(analysisText),
        this.assessQuality(analysisText)
      ])

      // 合并分类结果
      const result = {
        novelId: novel.id,
        genre: classifications[0],
        theme: classifications[1],
        target: classifications[2],
        quality: classifications[3],
        confidence: this.calculateOverallConfidence(classifications),
        aiTags: this.generateAITags(classifications),
        timestamp: Date.now()
      }

      // 缓存分类结果
      await this.cacheClassification(novel.id, result)
      
      // 记录AI请求
      await this.recordAIRequest()

      return result

    } catch (error) {
      console.error('内容分类失败:', error)
      throw new Error(`分类失败: ${error.message}`)
    }
  }

  // 准备用于分析的文本
  prepareAnalysisText(novel) {
    const parts = []
    
    // 添加标题和作者
    if (novel.title) parts.push(`标题: ${novel.title}`)
    if (novel.author) parts.push(`作者: ${novel.author}`)
    
    // 添加描述
    if (novel.description) {
      parts.push(`简介: ${novel.description}`)
    }
    
    // 添加章节内容样本 (如果有)
    if (novel.chapters && novel.chapters.length > 0) {
      const sampleChapters = novel.chapters.slice(0, 3) // 取前3章
      sampleChapters.forEach((chapter, index) => {
        if (chapter.content) {
          const content = chapter.content.substring(0, 500) // 每章取500字符
          parts.push(`第${index + 1}章内容: ${content}`)
        }
      })
    }
    
    // 添加现有标签 (如果有)
    if (novel.tags && novel.tags.length > 0) {
      parts.push(`现有标签: ${novel.tags.join(', ')}`)
    }
    
    return parts.join('\n\n')
  }

  // 分类小说类型
  async classifyGenre(text) {
    const prompt = `
请分析以下小说内容，从这些类型中选择最合适的1-3个：
${CLASSIFICATION_CONFIG.categories.genre.join(', ')}

小说内容：
${text}

请只返回选中的类型，用逗号分隔，不要其他解释。
`

    try {
      const response = await this.ai.run(CLASSIFICATION_CONFIG.textGenerationModel, {
        messages: [{ role: 'user', content: prompt }]
      })

      const genres = this.parseClassificationResponse(response.response, CLASSIFICATION_CONFIG.categories.genre)
      return {
        categories: genres,
        confidence: 0.8 // 基础置信度
      }
    } catch (error) {
      console.error('类型分类失败:', error)
      return { categories: ['未分类'], confidence: 0.1 }
    }
  }

  // 分类小说主题
  async classifyTheme(text) {
    const prompt = `
请分析以下小说的主题风格，从这些选项中选择最合适的1-2个：
${CLASSIFICATION_CONFIG.categories.theme.join(', ')}

小说内容：
${text}

请只返回选中的主题，用逗号分隔。
`

    try {
      const response = await this.ai.run(CLASSIFICATION_CONFIG.textGenerationModel, {
        messages: [{ role: 'user', content: prompt }]
      })

      const themes = this.parseClassificationResponse(response.response, CLASSIFICATION_CONFIG.categories.theme)
      return {
        categories: themes,
        confidence: 0.75
      }
    } catch (error) {
      console.error('主题分类失败:', error)
      return { categories: ['未知'], confidence: 0.1 }
    }
  }

  // 分类目标读者
  async classifyTarget(text) {
    const prompt = `
请分析以下小说的目标读者群体，从这些选项中选择一个：
${CLASSIFICATION_CONFIG.categories.target.join(', ')}

小说内容：
${text}

请只返回一个最合适的目标读者群体。
`

    try {
      const response = await this.ai.run(CLASSIFICATION_CONFIG.textGenerationModel, {
        messages: [{ role: 'user', content: prompt }]
      })

      const targets = this.parseClassificationResponse(response.response, CLASSIFICATION_CONFIG.categories.target)
      return {
        categories: targets.slice(0, 1), // 只取第一个
        confidence: 0.7
      }
    } catch (error) {
      console.error('目标读者分类失败:', error)
      return { categories: ['全年龄'], confidence: 0.5 }
    }
  }

  // 评估内容质量
  async assessQuality(text) {
    const prompt = `
请评估以下小说内容的质量，从这些等级中选择一个：
${CLASSIFICATION_CONFIG.categories.quality.join(', ')}

评估标准：
- 精品：文笔优美，情节精彩，人物丰满
- 优秀：文笔流畅，情节合理，有亮点
- 良好：文笔尚可，情节完整，无明显缺陷
- 一般：文笔平庸，情节普通，缺乏特色
- 较差：文笔粗糙，情节混乱，问题较多

小说内容：
${text}

请只返回一个质量等级。
`

    try {
      const response = await this.ai.run(CLASSIFICATION_CONFIG.textGenerationModel, {
        messages: [{ role: 'user', content: prompt }]
      })

      const quality = this.parseClassificationResponse(response.response, CLASSIFICATION_CONFIG.categories.quality)
      return {
        categories: quality.slice(0, 1),
        confidence: 0.6 // 质量评估主观性较强，置信度较低
      }
    } catch (error) {
      console.error('质量评估失败:', error)
      return { categories: ['一般'], confidence: 0.3 }
    }
  }

  // 解析分类响应
  parseClassificationResponse(response, validCategories) {
    if (!response) return []
    
    // 清理响应文本
    const cleanResponse = response
      .replace(/[，。！？；：""''（）【】]/g, ',') // 替换中文标点
      .replace(/[.!?;:"'()\[\]]/g, ',') // 替换英文标点
      .toLowerCase()
    
    // 分割并过滤
    const categories = cleanResponse
      .split(',')
      .map(cat => cat.trim())
      .filter(cat => cat.length > 0)
      .filter(cat => validCategories.some(valid => 
        valid.toLowerCase().includes(cat) || cat.includes(valid.toLowerCase())
      ))
      .slice(0, 3) // 最多3个分类
    
    return categories.length > 0 ? categories : []
  }

  // 计算总体置信度
  calculateOverallConfidence(classifications) {
    const confidences = classifications.map(c => c.confidence)
    return confidences.reduce((sum, conf) => sum + conf, 0) / confidences.length
  }

  // 生成AI标签
  generateAITags(classifications) {
    const tags = []
    
    classifications.forEach(classification => {
      tags.push(...classification.categories)
    })
    
    // 去重并返回
    return [...new Set(tags)]
  }

  // 缓存分类结果
  async cacheClassification(novelId, result) {
    const cacheKey = `classification:${novelId}`
    await this.kv.put(cacheKey, JSON.stringify(result), {
      expirationTtl: CLASSIFICATION_CONFIG.cacheTTL
    })
  }

  // 获取缓存的分类结果
  async getCachedClassification(novelId) {
    const cacheKey = `classification:${novelId}`
    const cached = await this.kv.get(cacheKey)
    return cached ? JSON.parse(cached) : null
  }

  // 检查AI请求限制
  async checkRequestLimit() {
    const today = new Date().toISOString().split('T')[0]
    const requestKey = `ai_requests:${today}`
    
    const currentCount = await this.kv.get(requestKey)
    const count = currentCount ? parseInt(currentCount) : 0
    
    if (count >= CLASSIFICATION_CONFIG.dailyRequestLimit) {
      throw new Error('已达到每日AI请求限制')
    }
  }

  // 记录AI请求
  async recordAIRequest() {
    const today = new Date().toISOString().split('T')[0]
    const requestKey = `ai_requests:${today}`
    
    const currentCount = await this.kv.get(requestKey)
    const count = currentCount ? parseInt(currentCount) : 0
    
    await this.kv.put(requestKey, (count + 1).toString(), {
      expirationTtl: CLASSIFICATION_CONFIG.requestWindow / 1000
    })
  }
}

// 批处理管理器
class BatchProcessor {
  constructor(env) {
    this.env = env
    this.classifier = new ContentClassifier(env)
    this.kv = env.NEXUS_KV
  }

  // 批量处理小说分类
  async processBatch(novels) {
    const results = []
    const errors = []
    
    // 分批处理
    for (let i = 0; i < novels.length; i += CLASSIFICATION_CONFIG.batchSize) {
      const batch = novels.slice(i, i + CLASSIFICATION_CONFIG.batchSize)
      
      try {
        const batchResults = await this.processBatchChunk(batch)
        results.push(...batchResults)
        
        // 添加延迟避免速率限制
        if (i + CLASSIFICATION_CONFIG.batchSize < novels.length) {
          await this.delay(1000) // 1秒延迟
        }
        
      } catch (error) {
        console.error(`批处理块 ${Math.floor(i / CLASSIFICATION_CONFIG.batchSize) + 1} 失败:`, error)
        errors.push({
          batchIndex: Math.floor(i / CLASSIFICATION_CONFIG.batchSize) + 1,
          error: error.message,
          novels: batch.map(n => n.id)
        })
      }
    }
    
    return {
      success: results,
      errors: errors,
      total: novels.length,
      processed: results.length,
      failed: errors.length
    }
  }

  // 处理单个批次
  async processBatchChunk(novels) {
    const promises = novels.map(async (novel) => {
      try {
        // 检查缓存
        const cached = await this.classifier.getCachedClassification(novel.id)
        if (cached) {
          return cached
        }
        
        // 执行分类
        return await this.classifier.classifyNovel(novel)
        
      } catch (error) {
        console.error(`小说 ${novel.id} 分类失败:`, error)
        return {
          novelId: novel.id,
          error: error.message,
          timestamp: Date.now()
        }
      }
    })
    
    // 限制并发数
    const results = []
    for (let i = 0; i < promises.length; i += CLASSIFICATION_CONFIG.maxConcurrent) {
      const chunk = promises.slice(i, i + CLASSIFICATION_CONFIG.maxConcurrent)
      const chunkResults = await Promise.all(chunk)
      results.push(...chunkResults)
    }
    
    return results.filter(result => !result.error) // 过滤错误结果
  }

  // 延迟函数
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  // 获取批处理状态
  async getBatchStatus(batchId) {
    const statusKey = `batch_status:${batchId}`
    const status = await this.kv.get(statusKey)
    return status ? JSON.parse(status) : null
  }

  // 保存批处理状态
  async saveBatchStatus(batchId, status) {
    const statusKey = `batch_status:${batchId}`
    await this.kv.put(statusKey, JSON.stringify(status), {
      expirationTtl: 7 * 24 * 60 * 60 // 7天过期
    })
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
      const classifier = new ContentClassifier(env)
      const batchProcessor = new BatchProcessor(env)

      // 路由处理
      switch (path) {
        case '/classify-novel':
          return await handleClassifyNovel(request, classifier, corsHeaders)
        
        case '/batch-classify':
          return await handleBatchClassify(request, batchProcessor, corsHeaders)
        
        case '/batch-status':
          return await handleBatchStatus(request, batchProcessor, corsHeaders)
        
        case '/classification-stats':
          return await handleClassificationStats(request, env, corsHeaders)
        
        case '/health':
          return new Response(JSON.stringify({ 
            status: 'ok', 
            timestamp: Date.now(),
            service: 'content-classification'
          }), {
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

// 处理单个小说分类
async function handleClassifyNovel(request, classifier, corsHeaders) {
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

    // 检查缓存
    const cached = await classifier.getCachedClassification(novel.id)
    if (cached) {
      return new Response(JSON.stringify({ 
        ...cached,
        fromCache: true
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 执行分类
    const result = await classifier.classifyNovel(novel)

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('小说分类处理失败:', error)
    return new Response(JSON.stringify({ 
      error: '分类失败',
      message: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
}

// 处理批量分类
async function handleBatchClassify(request, batchProcessor, corsHeaders) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders })
  }

  try {
    const { novels, batchId } = await request.json()
    
    if (!novels || !Array.isArray(novels) || novels.length === 0) {
      return new Response(JSON.stringify({ error: '缺少小说数据' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const finalBatchId = batchId || `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // 保存初始状态
    await batchProcessor.saveBatchStatus(finalBatchId, {
      status: 'processing',
      total: novels.length,
      processed: 0,
      startTime: Date.now()
    })

    // 异步处理批量分类
    const result = await batchProcessor.processBatch(novels)

    // 更新最终状态
    await batchProcessor.saveBatchStatus(finalBatchId, {
      status: 'completed',
      ...result,
      endTime: Date.now()
    })

    return new Response(JSON.stringify({
      batchId: finalBatchId,
      ...result
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('批量分类处理失败:', error)
    return new Response(JSON.stringify({ 
      error: '批量分类失败',
      message: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
}

// 处理批处理状态查询
async function handleBatchStatus(request, batchProcessor, corsHeaders) {
  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders })
  }

  const url = new URL(request.url)
  const batchId = url.searchParams.get('batchId')

  if (!batchId) {
    return new Response(JSON.stringify({ error: '缺少批处理ID' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  try {
    const status = await batchProcessor.getBatchStatus(batchId)
    
    if (!status) {
      return new Response(JSON.stringify({ error: '批处理不存在' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify(status), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('批处理状态查询失败:', error)
    return new Response(JSON.stringify({ 
      error: '状态查询失败',
      message: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
}

// 处理分类统计
async function handleClassificationStats(request, env, corsHeaders) {
  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders })
  }

  try {
    const today = new Date().toISOString().split('T')[0]
    const requestKey = `ai_requests:${today}`
    
    const todayRequests = await env.NEXUS_KV.get(requestKey)
    const requestCount = todayRequests ? parseInt(todayRequests) : 0

    const stats = {
      dailyRequestLimit: CLASSIFICATION_CONFIG.dailyRequestLimit,
      todayRequests: requestCount,
      remainingRequests: CLASSIFICATION_CONFIG.dailyRequestLimit - requestCount,
      categories: CLASSIFICATION_CONFIG.categories,
      batchConfig: {
        batchSize: CLASSIFICATION_CONFIG.batchSize,
        maxConcurrent: CLASSIFICATION_CONFIG.maxConcurrent
      }
    }

    return new Response(JSON.stringify(stats), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('统计查询失败:', error)
    return new Response(JSON.stringify({ 
      error: '统计查询失败',
      message: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
}