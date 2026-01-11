/**
 * 🏥 Health Monitoring Worker
 * Cloudflare Worker for centralized health monitoring and alerting
 */

// 健康检查配置
const HEALTH_CONFIG = {
  // 检查间隔（秒）
  CHECK_INTERVAL: 60,
  
  // 超时设置（毫秒）
  TIMEOUT: 10000,
  
  // 重试次数
  MAX_RETRIES: 3,
  
  // 告警阈值
  ALERT_THRESHOLDS: {
    RESPONSE_TIME: 5000, // 5秒
    ERROR_RATE: 0.05,    // 5%
    UPTIME: 0.99         // 99%
  },
  
  // 监控的服务端点
  ENDPOINTS: [
    {
      name: 'nexus-reader-app',
      url: 'https://nexus-reader.yourdomain.com/health',
      critical: true
    },
    {
      name: 'nexus-lite-api',
      url: 'https://api.nexus-reader.yourdomain.com/api/health',
      critical: true
    },
    {
      name: 'cf-bypass-service',
      url: 'https://cf-bypass.nexus-reader.yourdomain.com/health',
      critical: false
    }
  ]
}

// CORS 头部
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400'
}

/**
 * 主处理函数
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const path = url.pathname

    // 处理 CORS 预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: CORS_HEADERS
      })
    }

    try {
      switch (path) {
        case '/health':
          return await handleHealthCheck(request, env)
        
        case '/status':
          return await handleSystemStatus(request, env)
        
        case '/alerts':
          return await handleAlerts(request, env)
        
        case '/metrics':
          return await handleMetrics(request, env)
        
        case '/trigger-check':
          return await handleTriggerCheck(request, env)
        
        default:
          return new Response('Not Found', { 
            status: 404,
            headers: CORS_HEADERS
          })
      }
    } catch (error) {
      console.error('Health monitoring worker error:', error)
      return new Response(JSON.stringify({
        error: 'Internal server error',
        message: error.message
      }), {
        status: 500,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json'
        }
      })
    }
  },

  // 定时任务处理
  async scheduled(event, env, ctx) {
    console.log('Running scheduled health checks...')
    
    try {
      await performScheduledHealthChecks(env)
    } catch (error) {
      console.error('Scheduled health check failed:', error)
    }
  }
}

/**
 * 处理健康检查请求
 */
async function handleHealthCheck(request, env) {
  const healthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    worker: {
      name: 'health-monitoring-worker',
      version: '1.0.0',
      region: request.cf?.colo || 'unknown'
    },
    services: []
  }

  // 检查所有配置的端点
  const checkPromises = HEALTH_CONFIG.ENDPOINTS.map(endpoint => 
    checkEndpointHealth(endpoint)
  )

  const results = await Promise.allSettled(checkPromises)
  
  results.forEach((result, index) => {
    const endpoint = HEALTH_CONFIG.ENDPOINTS[index]
    
    if (result.status === 'fulfilled') {
      healthStatus.services.push(result.value)
    } else {
      healthStatus.services.push({
        name: endpoint.name,
        url: endpoint.url,
        status: 'critical',
        error: result.reason?.message || 'Unknown error',
        responseTime: null,
        critical: endpoint.critical
      })
    }
  })

  // 确定整体状态
  const criticalServices = healthStatus.services.filter(s => s.critical && s.status !== 'healthy')
  const warningServices = healthStatus.services.filter(s => s.status === 'warning')

  if (criticalServices.length > 0) {
    healthStatus.status = 'critical'
  } else if (warningServices.length > 0) {
    healthStatus.status = 'warning'
  }

  // 保存健康检查结果
  await saveHealthCheckResult(env, healthStatus)

  const statusCode = healthStatus.status === 'healthy' ? 200 : 503

  return new Response(JSON.stringify(healthStatus, null, 2), {
    status: statusCode,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json'
    }
  })
}

/**
 * 处理系统状态请求
 */
async function handleSystemStatus(request, env) {
  try {
    // 获取最近的健康检查结果
    const recentChecks = await getRecentHealthChecks(env, 24) // 最近24小时
    
    // 计算统计信息
    const stats = calculateHealthStats(recentChecks)
    
    const systemStatus = {
      timestamp: new Date().toISOString(),
      uptime: stats.uptime,
      totalChecks: stats.totalChecks,
      successRate: stats.successRate,
      averageResponseTime: stats.averageResponseTime,
      recentChecks: recentChecks.slice(0, 10), // 最近10次检查
      services: stats.serviceStats
    }

    return new Response(JSON.stringify(systemStatus, null, 2), {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json'
      }
    })
  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Failed to get system status',
      message: error.message
    }), {
      status: 500,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json'
      }
    })
  }
}

/**
 * 处理告警请求
 */
async function handleAlerts(request, env) {
  try {
    const url = new URL(request.url)
    const resolved = url.searchParams.get('resolved') === 'true'
    
    const alerts = await getAlerts(env, resolved)
    
    return new Response(JSON.stringify({
      alerts,
      total: alerts.length,
      timestamp: new Date().toISOString()
    }, null, 2), {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json'
      }
    })
  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Failed to get alerts',
      message: error.message
    }), {
      status: 500,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json'
      }
    })
  }
}

/**
 * 处理指标请求
 */
async function handleMetrics(request, env) {
  try {
    const url = new URL(request.url)
    const hours = parseInt(url.searchParams.get('hours') || '24')
    
    const metrics = await getHealthMetrics(env, hours)
    
    return new Response(JSON.stringify(metrics, null, 2), {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json'
      }
    })
  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Failed to get metrics',
      message: error.message
    }), {
      status: 500,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json'
      }
    })
  }
}

/**
 * 处理手动触发检查请求
 */
async function handleTriggerCheck(request, env) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', {
      status: 405,
      headers: CORS_HEADERS
    })
  }

  try {
    // 执行健康检查
    const result = await performHealthChecks(env)
    
    return new Response(JSON.stringify({
      message: 'Health check triggered successfully',
      result,
      timestamp: new Date().toISOString()
    }, null, 2), {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json'
      }
    })
  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Failed to trigger health check',
      message: error.message
    }), {
      status: 500,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json'
      }
    })
  }
}

/**
 * 检查单个端点健康状态
 */
async function checkEndpointHealth(endpoint) {
  const startTime = Date.now()
  
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), HEALTH_CONFIG.TIMEOUT)
    
    const response = await fetch(endpoint.url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Nexus-Health-Monitor/1.0'
      }
    })
    
    clearTimeout(timeoutId)
    const responseTime = Date.now() - startTime
    
    let status = 'healthy'
    if (responseTime > HEALTH_CONFIG.ALERT_THRESHOLDS.RESPONSE_TIME) {
      status = 'warning'
    }
    if (!response.ok) {
      status = 'critical'
    }
    
    // 尝试解析响应体
    let responseData = null
    try {
      const contentType = response.headers.get('content-type')
      if (contentType && contentType.includes('application/json')) {
        responseData = await response.json()
      }
    } catch (e) {
      // 忽略解析错误
    }
    
    return {
      name: endpoint.name,
      url: endpoint.url,
      status,
      responseTime,
      httpStatus: response.status,
      critical: endpoint.critical,
      data: responseData,
      timestamp: new Date().toISOString()
    }
    
  } catch (error) {
    const responseTime = Date.now() - startTime
    
    return {
      name: endpoint.name,
      url: endpoint.url,
      status: 'critical',
      responseTime,
      error: error.message,
      critical: endpoint.critical,
      timestamp: new Date().toISOString()
    }
  }
}

/**
 * 执行定时健康检查
 */
async function performScheduledHealthChecks(env) {
  const result = await performHealthChecks(env)
  
  // 检查是否需要发送告警
  await checkAndSendAlerts(env, result)
  
  return result
}

/**
 * 执行健康检查
 */
async function performHealthChecks(env) {
  const checkPromises = HEALTH_CONFIG.ENDPOINTS.map(endpoint => 
    checkEndpointHealth(endpoint)
  )
  
  const results = await Promise.allSettled(checkPromises)
  const healthStatus = {
    timestamp: new Date().toISOString(),
    services: [],
    overall: 'healthy'
  }
  
  results.forEach((result, index) => {
    const endpoint = HEALTH_CONFIG.ENDPOINTS[index]
    
    if (result.status === 'fulfilled') {
      healthStatus.services.push(result.value)
    } else {
      healthStatus.services.push({
        name: endpoint.name,
        url: endpoint.url,
        status: 'critical',
        error: result.reason?.message || 'Unknown error',
        critical: endpoint.critical,
        timestamp: new Date().toISOString()
      })
    }
  })
  
  // 确定整体状态
  const criticalServices = healthStatus.services.filter(s => s.critical && s.status !== 'healthy')
  const warningServices = healthStatus.services.filter(s => s.status === 'warning')
  
  if (criticalServices.length > 0) {
    healthStatus.overall = 'critical'
  } else if (warningServices.length > 0) {
    healthStatus.overall = 'warning'
  }
  
  // 保存结果
  await saveHealthCheckResult(env, healthStatus)
  
  return healthStatus
}

/**
 * 保存健康检查结果
 */
async function saveHealthCheckResult(env, result) {
  try {
    const key = `health:${Date.now()}`
    await env.HEALTH_KV.put(key, JSON.stringify(result), {
      expirationTtl: 7 * 24 * 60 * 60 // 7天过期
    })
    
    // 保存最新结果
    await env.HEALTH_KV.put('health:latest', JSON.stringify(result))
    
  } catch (error) {
    console.error('Failed to save health check result:', error)
  }
}

/**
 * 获取最近的健康检查结果
 */
async function getRecentHealthChecks(env, hours = 24) {
  try {
    const cutoff = Date.now() - (hours * 60 * 60 * 1000)
    const list = await env.HEALTH_KV.list({ prefix: 'health:' })
    
    const results = []
    for (const key of list.keys) {
      if (key.name === 'health:latest') continue
      
      const timestamp = parseInt(key.name.split(':')[1])
      if (timestamp >= cutoff) {
        const data = await env.HEALTH_KV.get(key.name)
        if (data) {
          results.push(JSON.parse(data))
        }
      }
    }
    
    return results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
  } catch (error) {
    console.error('Failed to get recent health checks:', error)
    return []
  }
}

/**
 * 计算健康统计信息
 */
function calculateHealthStats(checks) {
  if (checks.length === 0) {
    return {
      uptime: 0,
      totalChecks: 0,
      successRate: 0,
      averageResponseTime: 0,
      serviceStats: {}
    }
  }
  
  const totalChecks = checks.length
  const successfulChecks = checks.filter(c => c.overall === 'healthy').length
  const successRate = successfulChecks / totalChecks
  
  // 计算平均响应时间
  let totalResponseTime = 0
  let responseTimeCount = 0
  
  checks.forEach(check => {
    check.services.forEach(service => {
      if (service.responseTime) {
        totalResponseTime += service.responseTime
        responseTimeCount++
      }
    })
  })
  
  const averageResponseTime = responseTimeCount > 0 ? totalResponseTime / responseTimeCount : 0
  
  // 计算服务统计
  const serviceStats = {}
  HEALTH_CONFIG.ENDPOINTS.forEach(endpoint => {
    const serviceName = endpoint.name
    const serviceChecks = checks.map(c => 
      c.services.find(s => s.name === serviceName)
    ).filter(Boolean)
    
    const serviceSuccessful = serviceChecks.filter(s => s.status === 'healthy').length
    const serviceUptime = serviceChecks.length > 0 ? serviceSuccessful / serviceChecks.length : 0
    
    serviceStats[serviceName] = {
      uptime: serviceUptime,
      totalChecks: serviceChecks.length,
      averageResponseTime: serviceChecks.reduce((sum, s) => sum + (s.responseTime || 0), 0) / serviceChecks.length || 0
    }
  })
  
  return {
    uptime: successRate,
    totalChecks,
    successRate,
    averageResponseTime,
    serviceStats
  }
}

/**
 * 检查并发送告警
 */
async function checkAndSendAlerts(env, healthStatus) {
  const alerts = []
  
  // 检查关键服务
  healthStatus.services.forEach(service => {
    if (service.critical && service.status !== 'healthy') {
      alerts.push({
        id: `${service.name}-${Date.now()}`,
        service: service.name,
        severity: service.status === 'critical' ? 'critical' : 'warning',
        message: `Service ${service.name} is ${service.status}`,
        details: service,
        timestamp: new Date().toISOString()
      })
    }
  })
  
  // 保存告警
  for (const alert of alerts) {
    await saveAlert(env, alert)
  }
  
  // 发送通知（如果有告警）
  if (alerts.length > 0) {
    await sendAlertNotifications(env, alerts)
  }
}

/**
 * 保存告警
 */
async function saveAlert(env, alert) {
  try {
    const key = `alert:${alert.id}`
    await env.HEALTH_KV.put(key, JSON.stringify(alert), {
      expirationTtl: 30 * 24 * 60 * 60 // 30天过期
    })
  } catch (error) {
    console.error('Failed to save alert:', error)
  }
}

/**
 * 获取告警
 */
async function getAlerts(env, resolved = false) {
  try {
    const list = await env.HEALTH_KV.list({ prefix: 'alert:' })
    const alerts = []
    
    for (const key of list.keys) {
      const data = await env.HEALTH_KV.get(key.name)
      if (data) {
        const alert = JSON.parse(data)
        if (resolved === Boolean(alert.resolved)) {
          alerts.push(alert)
        }
      }
    }
    
    return alerts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
  } catch (error) {
    console.error('Failed to get alerts:', error)
    return []
  }
}

/**
 * 发送告警通知
 */
async function sendAlertNotifications(env, alerts) {
  // 这里可以集成各种通知方式：
  // - Webhook
  // - 邮件
  // - Slack
  // - Discord
  // - 等等
  
  console.log(`Sending ${alerts.length} alert notifications:`)
  alerts.forEach(alert => {
    console.log(`- ${alert.severity.toUpperCase()}: ${alert.message}`)
  })
  
  // 示例：发送到 Webhook（如果配置了）
  if (env.ALERT_WEBHOOK_URL) {
    try {
      await fetch(env.ALERT_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: `🚨 Health Alert: ${alerts.length} new alerts`,
          alerts
        })
      })
    } catch (error) {
      console.error('Failed to send webhook notification:', error)
    }
  }
}

/**
 * 获取健康指标
 */
async function getHealthMetrics(env, hours = 24) {
  const checks = await getRecentHealthChecks(env, hours)
  const stats = calculateHealthStats(checks)
  
  // 生成时间序列数据
  const timeSeries = checks.map(check => ({
    timestamp: check.timestamp,
    overall: check.overall,
    services: check.services.reduce((acc, service) => {
      acc[service.name] = {
        status: service.status,
        responseTime: service.responseTime
      }
      return acc
    }, {})
  }))
  
  return {
    summary: stats,
    timeSeries,
    period: {
      hours,
      from: new Date(Date.now() - hours * 60 * 60 * 1000).toISOString(),
      to: new Date().toISOString()
    }
  }
}