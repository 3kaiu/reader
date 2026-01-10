/**
 * Enhanced Performance Dashboard - 增强版性能仪表板
 * 提供实时性能监控、分析和优化建议
 */

<template>
  <div class="enhanced-performance-dashboard" :class="{ 'dashboard-minimized': isMinimized }">
    <!-- 仪表板头部 -->
    <div class="dashboard-header">
      <div class="dashboard-title">
        <span class="title-icon">📊</span>
        <span class="title-text">性能监控</span>
        <span class="status-indicator" :class="performanceStatus"></span>
      </div>
      <div class="dashboard-controls">
        <button @click="toggleRecording" class="control-btn" :class="{ active: isRecording }">
          {{ isRecording ? '⏸️' : '▶️' }}
        </button>
        <button @click="clearMetrics" class="control-btn">🗑️</button>
        <button @click="exportData" class="control-btn">📤</button>
        <button @click="toggleMinimize" class="control-btn">
          {{ isMinimized ? '⬆️' : '⬇️' }}
        </button>
      </div>
    </div>

    <!-- 仪表板内容 -->
    <div v-if="!isMinimized" class="dashboard-content">
      <!-- 核心指标卡片 -->
      <div class="metrics-grid">
        <!-- Core Web Vitals -->
        <div class="metric-card vital-card">
          <div class="card-header">
            <h3>Core Web Vitals</h3>
            <span class="metric-score" :class="getVitalScore(coreWebVitals)">
              {{ getVitalScore(coreWebVitals) }}
            </span>
          </div>
          <div class="vital-metrics">
            <div class="vital-item">
              <span class="vital-label">LCP</span>
              <span class="vital-value" :class="getLCPStatus(coreWebVitals.lcp)">
                {{ formatTime(coreWebVitals.lcp) }}
              </span>
            </div>
            <div class="vital-item">
              <span class="vital-label">FID</span>
              <span class="vital-value" :class="getFIDStatus(coreWebVitals.fid)">
                {{ formatTime(coreWebVitals.fid) }}
              </span>
            </div>
            <div class="vital-item">
              <span class="vital-label">CLS</span>
              <span class="vital-value" :class="getCLSStatus(coreWebVitals.cls)">
                {{ coreWebVitals.cls.toFixed(3) }}
              </span>
            </div>
          </div>
        </div>

        <!-- 内存使用 -->
        <div class="metric-card memory-card">
          <div class="card-header">
            <h3>内存使用</h3>
            <span class="metric-value">{{ formatBytes(memoryUsage.used) }}</span>
          </div>
          <div class="memory-chart">
            <div class="memory-bar">
              <div 
                class="memory-fill" 
                :style="{ width: `${(memoryUsage.used / memoryUsage.limit) * 100}%` }"
                :class="getMemoryStatus(memoryUsage.used / memoryUsage.limit)"
              ></div>
            </div>
            <div class="memory-details">
              <span>已用: {{ formatBytes(memoryUsage.used) }}</span>
              <span>限制: {{ formatBytes(memoryUsage.limit) }}</span>
            </div>
          </div>
        </div>

        <!-- 网络性能 -->
        <div class="metric-card network-card">
          <div class="card-header">
            <h3>网络性能</h3>
            <span class="metric-value">{{ formatTime(networkMetrics.averageResponseTime) }}</span>
          </div>
          <div class="network-stats">
            <div class="stat-item">
              <span class="stat-label">请求数</span>
              <span class="stat-value">{{ networkMetrics.totalRequests }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">成功率</span>
              <span class="stat-value">{{ (networkMetrics.successRate * 100).toFixed(1) }}%</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">缓存命中</span>
              <span class="stat-value">{{ (networkMetrics.cacheHitRate * 100).toFixed(1) }}%</span>
            </div>
          </div>
        </div>

        <!-- 渲染性能 -->
        <div class="metric-card render-card">
          <div class="card-header">
            <h3>渲染性能</h3>
            <span class="metric-value">{{ renderMetrics.fps }} FPS</span>
          </div>
          <div class="render-stats">
            <div class="fps-chart">
              <canvas ref="fpsChartRef" width="200" height="60"></canvas>
            </div>
            <div class="render-details">
              <span>帧时间: {{ formatTime(renderMetrics.frameTime) }}</span>
              <span>丢帧: {{ renderMetrics.droppedFrames }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 详细图表区域 -->
      <div class="charts-section">
        <div class="chart-tabs">
          <button 
            v-for="tab in chartTabs" 
            :key="tab.id"
            @click="activeChartTab = tab.id"
            class="tab-btn"
            :class="{ active: activeChartTab === tab.id }"
          >
            {{ tab.label }}
          </button>
        </div>

        <div class="chart-content">
          <!-- 性能趋势图 -->
          <div v-if="activeChartTab === 'trends'" class="chart-panel">
            <canvas ref="trendsChartRef" width="800" height="300"></canvas>
          </div>

          <!-- 资源加载瀑布图 -->
          <div v-if="activeChartTab === 'waterfall'" class="chart-panel">
            <div class="waterfall-chart">
              <div 
                v-for="resource in resourceTimings" 
                :key="resource.name"
                class="resource-bar"
              >
                <div class="resource-name">{{ getResourceName(resource.name) }}</div>
                <div class="resource-timeline">
                  <div 
                    class="timeline-bar"
                    :style="getTimelineStyle(resource)"
                    :class="getResourceType(resource.name)"
                  ></div>
                  <span class="resource-duration">{{ formatTime(resource.duration) }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 用户行为分析 -->
          <div v-if="activeChartTab === 'user'" class="chart-panel">
            <div class="user-metrics">
              <div class="interaction-heatmap">
                <h4>交互热力图</h4>
                <canvas ref="heatmapRef" width="400" height="300"></canvas>
              </div>
              <div class="user-journey">
                <h4>用户路径</h4>
                <div class="journey-steps">
                  <div 
                    v-for="step in userJourney" 
                    :key="step.id"
                    class="journey-step"
                  >
                    <div class="step-icon">{{ step.icon }}</div>
                    <div class="step-info">
                      <div class="step-name">{{ step.name }}</div>
                      <div class="step-time">{{ formatTime(step.duration) }}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 错误分析 -->
          <div v-if="activeChartTab === 'errors'" class="chart-panel">
            <div class="error-analysis">
              <div class="error-summary">
                <div class="error-count">
                  <span class="count-number">{{ errorMetrics.totalErrors }}</span>
                  <span class="count-label">总错误数</span>
                </div>
                <div class="error-rate">
                  <span class="rate-number">{{ (errorMetrics.errorRate * 100).toFixed(2) }}%</span>
                  <span class="rate-label">错误率</span>
                </div>
              </div>
              <div class="error-list">
                <div 
                  v-for="error in recentErrors" 
                  :key="error.id"
                  class="error-item"
                  :class="error.severity"
                >
                  <div class="error-icon">{{ getErrorIcon(error.severity) }}</div>
                  <div class="error-details">
                    <div class="error-message">{{ error.message }}</div>
                    <div class="error-meta">
                      <span>{{ error.source }}</span>
                      <span>{{ formatTime(error.timestamp) }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 性能建议 -->
      <div class="recommendations-section">
        <h3>性能建议</h3>
        <div class="recommendations-list">
          <div 
            v-for="recommendation in recommendations" 
            :key="recommendation.id"
            class="recommendation-item"
            :class="recommendation.priority"
          >
            <div class="recommendation-icon">{{ recommendation.icon }}</div>
            <div class="recommendation-content">
              <div class="recommendation-title">{{ recommendation.title }}</div>
              <div class="recommendation-description">{{ recommendation.description }}</div>
              <div class="recommendation-impact">
                预期提升: {{ recommendation.expectedImprovement }}
              </div>
            </div>
            <button @click="applyRecommendation(recommendation)" class="apply-btn">
              应用
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { usePerformanceMonitor } from '../composables/usePerformanceMonitor'

// 接口定义
interface CoreWebVitals {
  lcp: number
  fid: number
  cls: number
}

interface MemoryUsage {
  used: number
  limit: number
  total: number
}

interface NetworkMetrics {
  totalRequests: number
  averageResponseTime: number
  successRate: number
  cacheHitRate: number
}

interface RenderMetrics {
  fps: number
  frameTime: number
  droppedFrames: number
}

interface ResourceTiming {
  name: string
  startTime: number
  duration: number
  size: number
  type: string
}

interface UserJourneyStep {
  id: string
  name: string
  icon: string
  duration: number
  timestamp: number
}

interface ErrorMetric {
  id: string
  message: string
  source: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  timestamp: number
  count: number
}

interface Recommendation {
  id: string
  title: string
  description: string
  icon: string
  priority: 'low' | 'medium' | 'high'
  expectedImprovement: string
  action: () => void
}

// 响应式状态
const isMinimized = ref(false)
const isRecording = ref(true)
const activeChartTab = ref('trends')

// 图表引用
const fpsChartRef = ref<HTMLCanvasElement>()
const trendsChartRef = ref<HTMLCanvasElement>()
const heatmapRef = ref<HTMLCanvasElement>()

// 性能监控
const { metrics, startMonitoring, stopMonitoring, clearMetrics: clearPerformanceMetrics } = usePerformanceMonitor()

// 模拟数据（实际应用中应从性能监控系统获取）
const coreWebVitals = ref<CoreWebVitals>({
  lcp: 1200,
  fid: 50,
  cls: 0.05
})

const memoryUsage = ref<MemoryUsage>({
  used: 45 * 1024 * 1024, // 45MB
  limit: 100 * 1024 * 1024, // 100MB
  total: 8 * 1024 * 1024 * 1024 // 8GB
})

const networkMetrics = ref<NetworkMetrics>({
  totalRequests: 156,
  averageResponseTime: 245,
  successRate: 0.98,
  cacheHitRate: 0.75
})

const renderMetrics = ref<RenderMetrics>({
  fps: 58,
  frameTime: 16.8,
  droppedFrames: 3
})

const resourceTimings = ref<ResourceTiming[]>([
  { name: '/api/chapters', startTime: 100, duration: 245, size: 15420, type: 'xhr' },
  { name: '/images/cover.jpg', startTime: 150, duration: 180, size: 45600, type: 'img' },
  { name: '/fonts/main.woff2', startTime: 50, duration: 120, size: 23400, type: 'font' },
  { name: '/js/chunk-vendor.js', startTime: 0, duration: 300, size: 156000, type: 'script' }
])

const userJourney = ref<UserJourneyStep[]>([
  { id: '1', name: '页面加载', icon: '🚀', duration: 1200, timestamp: Date.now() - 5000 },
  { id: '2', name: '章节列表', icon: '📚', duration: 300, timestamp: Date.now() - 4000 },
  { id: '3', name: '阅读内容', icon: '👁️', duration: 15000, timestamp: Date.now() - 3000 },
  { id: '4', name: '翻页操作', icon: '👆', duration: 100, timestamp: Date.now() - 1000 }
])

const recentErrors = ref<ErrorMetric[]>([
  {
    id: '1',
    message: 'Failed to load chapter content',
    source: 'api/chapters/123',
    severity: 'medium',
    timestamp: Date.now() - 30000,
    count: 2
  },
  {
    id: '2',
    message: 'Image load timeout',
    source: 'images/cover.jpg',
    severity: 'low',
    timestamp: Date.now() - 60000,
    count: 1
  }
])

const errorMetrics = computed(() => ({
  totalErrors: recentErrors.value.reduce((sum, error) => sum + error.count, 0),
  errorRate: recentErrors.value.length / networkMetrics.value.totalRequests
}))

const recommendations = ref<Recommendation[]>([
  {
    id: '1',
    title: '启用图片懒加载',
    description: '对非关键图片启用懒加载可以减少初始页面加载时间',
    icon: '🖼️',
    priority: 'high',
    expectedImprovement: '减少 15% 加载时间',
    action: () => console.log('Apply lazy loading')
  },
  {
    id: '2',
    title: '优化字体加载',
    description: '使用 font-display: swap 可以防止文本闪烁',
    icon: '🔤',
    priority: 'medium',
    expectedImprovement: '改善 CLS 指标',
    action: () => console.log('Optimize fonts')
  }
])

// 图表标签
const chartTabs = [
  { id: 'trends', label: '性能趋势' },
  { id: 'waterfall', label: '资源瀑布' },
  { id: 'user', label: '用户行为' },
  { id: 'errors', label: '错误分析' }
]

// 计算属性
const performanceStatus = computed(() => {
  const score = getOverallScore()
  if (score >= 90) return 'excellent'
  if (score >= 70) return 'good'
  if (score >= 50) return 'needs-improvement'
  return 'poor'
})

// 方法
const toggleMinimize = () => {
  isMinimized.value = !isMinimized.value
}

const toggleRecording = () => {
  isRecording.value = !isRecording.value
  if (isRecording.value) {
    startMonitoring()
  } else {
    stopMonitoring()
  }
}

const clearMetrics = () => {
  clearPerformanceMetrics()
  // 清理其他指标
}

const exportData = () => {
  const data = {
    coreWebVitals: coreWebVitals.value,
    memoryUsage: memoryUsage.value,
    networkMetrics: networkMetrics.value,
    renderMetrics: renderMetrics.value,
    timestamp: new Date().toISOString()
  }
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `performance-data-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

const getOverallScore = (): number => {
  // 计算综合性能分数
  const lcpScore = coreWebVitals.value.lcp <= 2500 ? 100 : Math.max(0, 100 - (coreWebVitals.value.lcp - 2500) / 25)
  const fidScore = coreWebVitals.value.fid <= 100 ? 100 : Math.max(0, 100 - (coreWebVitals.value.fid - 100) / 2)
  const clsScore = coreWebVitals.value.cls <= 0.1 ? 100 : Math.max(0, 100 - (coreWebVitals.value.cls - 0.1) * 1000)
  const memoryScore = (memoryUsage.value.used / memoryUsage.value.limit) <= 0.8 ? 100 : 50
  
  return Math.round((lcpScore + fidScore + clsScore + memoryScore) / 4)
}

const getVitalScore = (vitals: CoreWebVitals): string => {
  const score = getOverallScore()
  if (score >= 90) return 'GOOD'
  if (score >= 50) return 'NEEDS IMPROVEMENT'
  return 'POOR'
}

const getLCPStatus = (lcp: number): string => {
  if (lcp <= 2500) return 'good'
  if (lcp <= 4000) return 'needs-improvement'
  return 'poor'
}

const getFIDStatus = (fid: number): string => {
  if (fid <= 100) return 'good'
  if (fid <= 300) return 'needs-improvement'
  return 'poor'
}

const getCLSStatus = (cls: number): string => {
  if (cls <= 0.1) return 'good'
  if (cls <= 0.25) return 'needs-improvement'
  return 'poor'
}

const getMemoryStatus = (ratio: number): string => {
  if (ratio <= 0.6) return 'good'
  if (ratio <= 0.8) return 'warning'
  return 'critical'
}

const formatTime = (ms: number): string => {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

const formatBytes = (bytes: number): string => {
  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let unitIndex = 0
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }
  
  return `${size.toFixed(1)} ${units[unitIndex]}`
}

const getResourceName = (url: string): string => {
  return url.split('/').pop() || url
}

const getResourceType = (url: string): string => {
  if (url.includes('.js')) return 'script'
  if (url.includes('.css')) return 'style'
  if (url.includes('.jpg') || url.includes('.png') || url.includes('.webp')) return 'image'
  if (url.includes('.woff') || url.includes('.ttf')) return 'font'
  if (url.includes('/api/')) return 'xhr'
  return 'other'
}

const getTimelineStyle = (resource: ResourceTiming) => {
  const maxDuration = Math.max(...resourceTimings.value.map(r => r.duration))
  const width = (resource.duration / maxDuration) * 100
  return {
    width: `${width}%`,
    marginLeft: `${(resource.startTime / maxDuration) * 10}%`
  }
}

const getErrorIcon = (severity: string): string => {
  switch (severity) {
    case 'critical': return '🔴'
    case 'high': return '🟠'
    case 'medium': return '🟡'
    case 'low': return '🟢'
    default: return '⚪'
  }
}

const applyRecommendation = (recommendation: Recommendation) => {
  recommendation.action()
  // 从列表中移除已应用的建议
  const index = recommendations.value.findIndex(r => r.id === recommendation.id)
  if (index > -1) {
    recommendations.value.splice(index, 1)
  }
}

// 图表绘制
const drawFPSChart = () => {
  const canvas = fpsChartRef.value
  if (!canvas) return
  
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  
  // 简单的FPS图表绘制
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.strokeStyle = '#4caf50'
  ctx.lineWidth = 2
  ctx.beginPath()
  
  // 模拟FPS数据
  const fpsData = Array.from({ length: 50 }, (_, i) => 
    55 + Math.sin(i * 0.1) * 5 + Math.random() * 3
  )
  
  fpsData.forEach((fps, i) => {
    const x = (i / fpsData.length) * canvas.width
    const y = canvas.height - (fps / 60) * canvas.height
    
    if (i === 0) {
      ctx.moveTo(x, y)
    } else {
      ctx.lineTo(x, y)
    }
  })
  
  ctx.stroke()
}

const drawTrendsChart = () => {
  const canvas = trendsChartRef.value
  if (!canvas) return
  
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  
  // 绘制性能趋势图
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  
  // 绘制网格
  ctx.strokeStyle = '#e0e0e0'
  ctx.lineWidth = 1
  
  for (let i = 0; i <= 10; i++) {
    const y = (i / 10) * canvas.height
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(canvas.width, y)
    ctx.stroke()
  }
  
  // 绘制数据线
  const drawMetricLine = (data: number[], color: string) => {
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.beginPath()
    
    data.forEach((value, i) => {
      const x = (i / (data.length - 1)) * canvas.width
      const y = canvas.height - (value / 100) * canvas.height
      
      if (i === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    })
    
    ctx.stroke()
  }
  
  // 模拟数据
  const lcpData = Array.from({ length: 20 }, () => Math.random() * 100)
  const fidData = Array.from({ length: 20 }, () => Math.random() * 100)
  const clsData = Array.from({ length: 20 }, () => Math.random() * 100)
  
  drawMetricLine(lcpData, '#ff5722')
  drawMetricLine(fidData, '#2196f3')
  drawMetricLine(clsData, '#4caf50')
}

// 生命周期
onMounted(() => {
  nextTick(() => {
    drawFPSChart()
    drawTrendsChart()
  })
  
  // 定期更新数据
  const updateInterval = setInterval(() => {
    if (isRecording.value) {
      // 更新实时数据
      renderMetrics.value.fps = 55 + Math.random() * 10
      renderMetrics.value.frameTime = 16 + Math.random() * 4
      
      // 重绘图表
      drawFPSChart()
    }
  }, 1000)
  
  onUnmounted(() => {
    clearInterval(updateInterval)
  })
})
</script>

<style scoped>
.enhanced-performance-dashboard {
  position: fixed;
  top: 20px;
  right: 20px;
  width: 400px;
  max-height: 80vh;
  background: rgba(0, 0, 0, 0.95);
  color: white;
  border-radius: 12px;
  padding: 20px;
  font-size: 13px;
  z-index: 9999;
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
  overflow-y: auto;
  transition: all 0.3s ease;
}

.dashboard-minimized {
  width: 200px;
  height: 60px;
  overflow: hidden;
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.dashboard-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.title-icon {
  font-size: 18px;
}

.title-text {
  font-size: 16px;
  font-weight: 600;
}

.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-left: 8px;
}

.status-indicator.excellent { background: #00ff00; }
.status-indicator.good { background: #90ee90; }
.status-indicator.needs-improvement { background: #ffff00; }
.status-indicator.poor { background: #ff0000; }

.dashboard-controls {
  display: flex;
  gap: 8px;
}

.control-btn {
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: white;
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}

.control-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.control-btn.active {
  background: rgba(76, 175, 80, 0.3);
  color: #4caf50;
}

.metrics-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 20px;
}

.metric-card {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.card-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.metric-score {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: bold;
}

.metric-score.GOOD { background: rgba(0, 255, 0, 0.2); color: #00ff00; }
.metric-score.NEEDS.IMPROVEMENT { background: rgba(255, 255, 0, 0.2); color: #ffff00; }
.metric-score.POOR { background: rgba(255, 0, 0, 0.2); color: #ff0000; }

.vital-metrics {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.vital-item {
  text-align: center;
}

.vital-label {
  display: block;
  font-size: 10px;
  opacity: 0.7;
  margin-bottom: 4px;
}

.vital-value {
  display: block;
  font-weight: bold;
  font-size: 12px;
}

.vital-value.good { color: #00ff00; }
.vital-value.needs-improvement { color: #ffff00; }
.vital-value.poor { color: #ff0000; }

.memory-chart {
  margin-top: 8px;
}

.memory-bar {
  width: 100%;
  height: 6px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 6px;
}

.memory-fill {
  height: 100%;
  transition: width 0.3s ease;
}

.memory-fill.good { background: #00ff00; }
.memory-fill.warning { background: #ffff00; }
.memory-fill.critical { background: #ff0000; }

.memory-details {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  opacity: 0.8;
}

.network-stats, .render-stats {
  margin-top: 8px;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
  font-size: 11px;
}

.stat-label {
  opacity: 0.7;
}

.fps-chart {
  margin-bottom: 8px;
}

.render-details {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  opacity: 0.8;
}

.charts-section {
  margin-bottom: 20px;
}

.chart-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 12px;
}

.tab-btn {
  flex: 1;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: white;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 10px;
  transition: all 0.2s;
}

.tab-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.tab-btn.active {
  background: rgba(33, 150, 243, 0.3);
  color: #2196f3;
}

.chart-content {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  padding: 12px;
  min-height: 200px;
}

.waterfall-chart {
  max-height: 250px;
  overflow-y: auto;
}

.resource-bar {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
  font-size: 10px;
}

.resource-name {
  width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-right: 8px;
}

.resource-timeline {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
}

.timeline-bar {
  height: 4px;
  border-radius: 2px;
  min-width: 2px;
}

.timeline-bar.script { background: #ff9800; }
.timeline-bar.style { background: #9c27b0; }
.timeline-bar.image { background: #4caf50; }
.timeline-bar.font { background: #2196f3; }
.timeline-bar.xhr { background: #f44336; }
.timeline-bar.other { background: #607d8b; }

.user-metrics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.journey-steps {
  max-height: 200px;
  overflow-y: auto;
}

.journey-step {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  padding: 6px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
}

.step-icon {
  font-size: 16px;
}

.step-info {
  flex: 1;
}

.step-name {
  font-size: 11px;
  font-weight: 500;
}

.step-time {
  font-size: 10px;
  opacity: 0.7;
}

.error-analysis {
  max-height: 250px;
  overflow-y: auto;
}

.error-summary {
  display: flex;
  gap: 20px;
  margin-bottom: 12px;
  text-align: center;
}

.error-count, .error-rate {
  flex: 1;
}

.count-number, .rate-number {
  display: block;
  font-size: 18px;
  font-weight: bold;
  color: #ff5722;
}

.count-label, .rate-label {
  font-size: 10px;
  opacity: 0.7;
}

.error-list {
  max-height: 150px;
  overflow-y: auto;
}

.error-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 8px;
  padding: 8px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
  border-left: 3px solid;
}

.error-item.critical { border-left-color: #f44336; }
.error-item.high { border-left-color: #ff9800; }
.error-item.medium { border-left-color: #ffeb3b; }
.error-item.low { border-left-color: #4caf50; }

.error-icon {
  font-size: 14px;
}

.error-details {
  flex: 1;
}

.error-message {
  font-size: 11px;
  font-weight: 500;
  margin-bottom: 2px;
}

.error-meta {
  display: flex;
  gap: 8px;
  font-size: 9px;
  opacity: 0.7;
}

.recommendations-section h3 {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
}

.recommendations-list {
  max-height: 200px;
  overflow-y: auto;
}

.recommendation-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 12px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  border-left: 3px solid;
}

.recommendation-item.high { border-left-color: #f44336; }
.recommendation-item.medium { border-left-color: #ff9800; }
.recommendation-item.low { border-left-color: #4caf50; }

.recommendation-icon {
  font-size: 16px;
}

.recommendation-content {
  flex: 1;
}

.recommendation-title {
  font-size: 12px;
  font-weight: 500;
  margin-bottom: 4px;
}

.recommendation-description {
  font-size: 10px;
  opacity: 0.8;
  line-height: 1.4;
  margin-bottom: 4px;
}

.recommendation-impact {
  font-size: 9px;
  color: #4caf50;
  font-weight: 500;
}

.apply-btn {
  background: rgba(76, 175, 80, 0.2);
  border: 1px solid rgba(76, 175, 80, 0.3);
  color: #4caf50;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 10px;
  transition: all 0.2s;
}

.apply-btn:hover {
  background: rgba(76, 175, 80, 0.3);
}

/* 响应式 */
@media (max-width: 768px) {
  .enhanced-performance-dashboard {
    width: 320px;
    right: 10px;
    top: 10px;
  }
  
  .metrics-grid {
    grid-template-columns: 1fr;
  }
  
  .user-metrics {
    grid-template-columns: 1fr;
  }
}

/* 滚动条样式 */
.enhanced-performance-dashboard::-webkit-scrollbar,
.waterfall-chart::-webkit-scrollbar,
.journey-steps::-webkit-scrollbar,
.error-list::-webkit-scrollbar,
.recommendations-list::-webkit-scrollbar {
  width: 4px;
}

.enhanced-performance-dashboard::-webkit-scrollbar-track,
.waterfall-chart::-webkit-scrollbar-track,
.journey-steps::-webkit-scrollbar-track,
.error-list::-webkit-scrollbar-track,
.recommendations-list::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
}

.enhanced-performance-dashboard::-webkit-scrollbar-thumb,
.waterfall-chart::-webkit-scrollbar-thumb,
.journey-steps::-webkit-scrollbar-thumb,
.error-list::-webkit-scrollbar-thumb,
.recommendations-list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.3);
  border-radius: 2px;
}

.enhanced-performance-dashboard::-webkit-scrollbar-thumb:hover,
.waterfall-chart::-webkit-scrollbar-thumb:hover,
.journey-steps::-webkit-scrollbar-thumb:hover,
.error-list::-webkit-scrollbar-thumb:hover,
.recommendations-list::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.5);
}
</style>