/**
 * Cloudflare Worker for Error Logging and Alerting
 * 处理错误日志收集、聚合和告警通知
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const path = url.pathname

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }

    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders })
    }

    try {
      switch (path) {
        case '/api/errors/log':
          return await handleErrorLog(request, env, corsHeaders)
        
        case '/api/errors/metrics':
          return await handleErrorMetrics(request, env, corsHeaders)
        
        case '/api/errors/alerts':
          return await handleErrorAlerts(request, env, corsHeaders)
        
        case '/api/errors/export':
          return await handleErrorExport(request, env, corsHeaders)
        
        default:
          return new Response('Not Found', { 
            status: 404, 
            headers: corsHeaders 
          })
      }
    } catch (error) {
      console.error('Worker error:', error)
      return new Response(JSON.stringify({
        error: 'Internal Server Error',
        message: error.message
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      })
    }
  }
}

/**
 * 处理错误日志记录
 */
async function handleErrorLog(request, env, corsHeaders) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { 
      status: 405, 
      headers: corsHeaders 
    })
  }

  const errorData = await request.json()
  
  // 验证错误数据
  if (!errorData.fingerprint || !errorData.message) {
    return new Response(JSON.stringify({
      error: 'Invalid error data',
      message: 'fingerprint and message are required'
    }), {
      status: 400,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    })
  }

  // 存储错误到KV
  const errorKey = `error:${errorData.fingerprint}`
  const existingError = await env.ERROR_LOGS.get(errorKey, 'json')
  
  let errorEntry
  if (existingError) {
    // 更新现有错误
    errorEntry = {
      ...existingError,
      count: existingError.count + 1,
      lastOccurrence: Date.now(),
      context: { ...existingError.context, ...errorData.context }
    }
  } else {
    // 创建新错误条目
    errorEntry = {
      fingerprint: errorData.fingerprint,
      message: errorData.message,
      category: errorData.category || 'unknown',
      severity: errorData.severity || 'medium',
      stack: errorData.stack,
      context: errorData.context || {},
      firstOccurrence: Date.now(),
      lastOccurrence: Date.now(),
      count: 1
    }
  }

  // 保存到KV
  await env.ERROR_LOGS.put(errorKey, JSON.stringify(errorEntry), {
    expirationTtl: 7 * 24 * 60 * 60 // 7天过期
  })

  // 更新错误统计
  await updateErrorMetrics(env, errorEntry)

  // 检查告警条件
  await checkAlertConditions(env, errorEntry)

  return new Response(JSON.stringify({
    success: true,
    fingerprint: errorData.fingerprint,
    count: errorEntry.count
  }), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  })
}

/**
 * 处理错误指标查询
 */
async function handleErrorMetrics(request, env, corsHeaders) {
  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', { 
      status: 405, 
      headers: corsHeaders 
    })
  }

  const url = new URL(request.url)
  const timeWindow = parseInt(url.searchParams.get('timeWindow')) || 3600000 // 默认1小时
  const category = url.searchParams.get('category')
  const severity = url.searchParams.get('severity')

  // 获取错误统计
  const metricsKey = 'error_metrics'
  const metrics = await env.ERROR_LOGS.get(metricsKey, 'json') || {
    totalErrors: 0,
    errorsByCategory: {},
    errorsBySeverity: {},
    errorsByHour: {},
    lastUpdated: Date.now()
  }

  // 获取最近的错误列表
  const errorsList = await getRecentErrors(env, timeWindow, category, severity)

  // 计算实时指标
  const now = Date.now()
  const windowStart = now - timeWindow
  const recentErrors = errorsList.filter(error => 
    error.lastOccurrence >= windowStart
  )

  const errorCount = recentErrors.reduce((sum, error) => sum + error.count, 0)
  const errorRate = errorCount / (timeWindow / 1000) // 每秒错误数

  const topErrors = recentErrors
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map(error => ({
      message: error.message,
      count: error.count,
      lastOccurrence: error.lastOccurrence,
      category: error.category,
      severity: error.severity
    }))

  return new Response(JSON.stringify({
    errorCount,
    errorRate,
    lastErrorTime: Math.max(...recentErrors.map(e => e.lastOccurrence), 0),
    topErrors,
    totalErrors: metrics.totalErrors,
    errorsByCategory: metrics.errorsByCategory,
    errorsBySeverity: metrics.errorsBySeverity,
    timeWindow,
    generatedAt: now
  }), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  })
}

/**
 * 处理告警查询
 */
async function handleErrorAlerts(request, env, corsHeaders) {
  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', { 
      status: 405, 
      headers: corsHeaders 
    })
  }

  // 获取活跃告警
  const alertsKey = 'active_alerts'
  const alerts = await env.ERROR_LOGS.get(alertsKey, 'json') || []

  // 过滤过期的告警（24小时）
  const now = Date.now()
  const activeAlerts = alerts.filter(alert => 
    (now - alert.timestamp) < 24 * 60 * 60 * 1000
  )

  // 更新活跃告警列表
  if (activeAlerts.length !== alerts.length) {
    await env.ERROR_LOGS.put(alertsKey, JSON.stringify(activeAlerts))
  }

  return new Response(JSON.stringify({
    alerts: activeAlerts,
    count: activeAlerts.length,
    generatedAt: now
  }), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  })
}

/**
 * 处理错误数据导出
 */
async function handleErrorExport(request, env, corsHeaders) {
  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', { 
      status: 405, 
      headers: corsHeaders 
    })
  }

  const url = new URL(request.url)
  const format = url.searchParams.get('format') || 'json'
  const timeWindow = parseInt(url.searchParams.get('timeWindow')) || 24 * 60 * 60 * 1000 // 默认24小时

  const errors = await getRecentErrors(env, timeWindow)

  if (format === 'csv') {
    const csvHeaders = ['timestamp', 'category', 'severity', 'message', 'count', 'fingerprint']
    const csvRows = errors.map(error => [
      new Date(error.lastOccurrence).toISOString(),
      error.category,
      error.severity,
      error.message.replace(/"/g, '""'),
      error.count,
      error.fingerprint
    ])

    const csvContent = [csvHeaders, ...csvRows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n')

    return new Response(csvContent, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="errors-${new Date().toISOString().split('T')[0]}.csv"`
      }
    })
  }

  return new Response(JSON.stringify({
    errors,
    exportedAt: Date.now(),
    timeWindow,
    count: errors.length
  }, null, 2), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="errors-${new Date().toISOString().split('T')[0]}.json"`
    }
  })
}

/**
 * 更新错误统计指标
 */
async function updateErrorMetrics(env, errorEntry) {
  const metricsKey = 'error_metrics'
  const metrics = await env.ERROR_LOGS.get(metricsKey, 'json') || {
    totalErrors: 0,
    errorsByCategory: {},
    errorsBySeverity: {},
    errorsByHour: {},
    lastUpdated: Date.now()
  }

  // 更新总错误数
  metrics.totalErrors += 1

  // 更新按类别统计
  metrics.errorsByCategory[errorEntry.category] = 
    (metrics.errorsByCategory[errorEntry.category] || 0) + 1

  // 更新按严重程度统计
  metrics.errorsBySeverity[errorEntry.severity] = 
    (metrics.errorsBySeverity[errorEntry.severity] || 0) + 1

  // 更新按小时统计
  const hour = new Date().getHours()
  metrics.errorsByHour[hour] = (metrics.errorsByHour[hour] || 0) + 1

  metrics.lastUpdated = Date.now()

  await env.ERROR_LOGS.put(metricsKey, JSON.stringify(metrics))
}

/**
 * 检查告警条件
 */
async function checkAlertConditions(env, errorEntry) {
  const now = Date.now()
  
  // 获取告警规则
  const alertRules = [
    {
      id: 'critical_errors',
      name: '关键错误告警',
      condition: (error) => error.severity === 'critical',
      cooldownMs: 5 * 60 * 1000 // 5分钟冷却
    },
    {
      id: 'high_error_rate',
      name: '高错误率告警',
      condition: async (error) => {
        const recentErrors = await getRecentErrors(env, 5 * 60 * 1000) // 5分钟窗口
        const errorCount = recentErrors.reduce((sum, e) => sum + e.count, 0)
        return errorCount > 50 // 5分钟内超过50个错误
      },
      cooldownMs: 10 * 60 * 1000 // 10分钟冷却
    },
    {
      id: 'api_error_spike',
      name: 'API错误激增告警',
      condition: async (error) => {
        if (error.category !== 'api') return false
        const recentApiErrors = await getRecentErrors(env, 5 * 60 * 1000, 'api')
        return recentApiErrors.length > 10 // 5分钟内超过10个API错误
      },
      cooldownMs: 15 * 60 * 1000 // 15分钟冷却
    }
  ]

  // 获取告警状态
  const alertStateKey = 'alert_states'
  const alertStates = await env.ERROR_LOGS.get(alertStateKey, 'json') || {}

  for (const rule of alertRules) {
    const lastTriggered = alertStates[rule.id] || 0
    
    // 检查冷却时间
    if ((now - lastTriggered) < rule.cooldownMs) {
      continue
    }

    // 检查告警条件
    const shouldAlert = typeof rule.condition === 'function' 
      ? await rule.condition(errorEntry)
      : rule.condition(errorEntry)

    if (shouldAlert) {
      // 触发告警
      await triggerAlert(env, rule, errorEntry)
      
      // 更新告警状态
      alertStates[rule.id] = now
      await env.ERROR_LOGS.put(alertStateKey, JSON.stringify(alertStates))
    }
  }
}

/**
 * 触发告警
 */
async function triggerAlert(env, rule, errorEntry) {
  const alert = {
    id: `alert_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    ruleId: rule.id,
    ruleName: rule.name,
    severity: errorEntry.severity,
    timestamp: Date.now(),
    triggerError: {
      fingerprint: errorEntry.fingerprint,
      message: errorEntry.message,
      category: errorEntry.category,
      count: errorEntry.count
    },
    message: generateAlertMessage(rule, errorEntry)
  }

  // 保存告警到活跃告警列表
  const alertsKey = 'active_alerts'
  const alerts = await env.ERROR_LOGS.get(alertsKey, 'json') || []
  alerts.unshift(alert) // 添加到开头
  
  // 保留最近50个告警
  const trimmedAlerts = alerts.slice(0, 50)
  await env.ERROR_LOGS.put(alertsKey, JSON.stringify(trimmedAlerts))

  // 发送告警通知（如果配置了webhook）
  if (env.ALERT_WEBHOOK_URL) {
    try {
      await fetch(env.ALERT_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: `🚨 ${alert.ruleName}\n${alert.message}`,
          alert: alert
        })
      })
    } catch (error) {
      console.error('Failed to send alert webhook:', error)
    }
  }

  console.log(`Alert triggered: ${rule.name}`, alert)
}

/**
 * 生成告警消息
 */
function generateAlertMessage(rule, errorEntry) {
  switch (rule.id) {
    case 'critical_errors':
      return `检测到关键错误: ${errorEntry.message} (发生 ${errorEntry.count} 次)`
    
    case 'high_error_rate':
      return `检测到高错误率，5分钟内错误数量异常增加`
    
    case 'api_error_spike':
      return `API错误激增: ${errorEntry.message} (类别: ${errorEntry.category})`
    
    default:
      return `告警规则 "${rule.name}" 被触发: ${errorEntry.message}`
  }
}

/**
 * 获取最近的错误列表
 */
async function getRecentErrors(env, timeWindow, category = null, severity = null) {
  const now = Date.now()
  const windowStart = now - timeWindow
  
  // 由于KV不支持范围查询，我们需要维护一个错误索引
  const indexKey = 'error_index'
  const errorIndex = await env.ERROR_LOGS.get(indexKey, 'json') || []
  
  const errors = []
  
  // 批量获取错误数据
  const batchSize = 50
  for (let i = 0; i < Math.min(errorIndex.length, batchSize); i++) {
    const fingerprint = errorIndex[i]
    const errorKey = `error:${fingerprint}`
    const error = await env.ERROR_LOGS.get(errorKey, 'json')
    
    if (error && error.lastOccurrence >= windowStart) {
      // 应用过滤器
      if (category && error.category !== category) continue
      if (severity && error.severity !== severity) continue
      
      errors.push(error)
    }
  }
  
  return errors.sort((a, b) => b.lastOccurrence - a.lastOccurrence)
}

/**
 * 更新错误索引
 */
async function updateErrorIndex(env, fingerprint) {
  const indexKey = 'error_index'
  const errorIndex = await env.ERROR_LOGS.get(indexKey, 'json') || []
  
  // 如果不存在则添加到开头
  if (!errorIndex.includes(fingerprint)) {
    errorIndex.unshift(fingerprint)
    
    // 保留最近1000个错误的索引
    const trimmedIndex = errorIndex.slice(0, 1000)
    await env.ERROR_LOGS.put(indexKey, JSON.stringify(trimmedIndex))
  }
}