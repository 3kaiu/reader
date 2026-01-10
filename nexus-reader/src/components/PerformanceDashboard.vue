<template>
  <div v-if="showDashboard" class="performance-dashboard">
    <div class="dashboard-header">
      <h3>性能监控</h3>
      <div class="dashboard-controls">
        <button @click="toggleDashboard" class="toggle-btn">
          {{ isExpanded ? '收起' : '展开' }}
        </button>
        <button @click="exportReport" class="export-btn">导出报告</button>
        <button @click="closeDashboard" class="close-btn">×</button>
      </div>
    </div>

    <div v-if="isExpanded" class="dashboard-content">
      <!-- 性能评分 -->
      <div class="performance-score">
        <div class="score-circle" :class="scoreClass">
          <span class="score-value">{{ performanceScore }}</span>
          <span class="score-grade">{{ performanceGrade }}</span>
        </div>
        <div class="score-details">
          <p>性能评分</p>
          <p v-if="hasPerformanceIssues" class="warning">⚠️ 发现性能问题</p>
        </div>
      </div>

      <!-- Core Web Vitals -->
      <div class="web-vitals">
        <h4>Core Web Vitals</h4>
        <div class="vitals-grid">
          <div class="vital-item">
            <span class="vital-label">LCP</span>
            <span class="vital-value" :class="getLCPClass()">
              {{ formatTime(currentMetrics?.lcp) }}
            </span>
          </div>
          <div class="vital-item">
            <span class="vital-label">FID</span>
            <span class="vital-value" :class="getFIDClass()">
              {{ formatTime(currentMetrics?.fid) }}
            </span>
          </div>
          <div class="vital-item">
            <span class="vital-label">CLS</span>
            <span class="vital-value" :class="getCLSClass()">
              {{ formatCLS(currentMetrics?.cls) }}
            </span>
          </div>
        </div>
      </div>

      <!-- 内存使用 -->
      <div class="memory-usage">
        <h4>内存使用</h4>
        <div class="memory-bar">
          <div 
            class="memory-fill" 
            :style="{ width: `${memoryPercentage}%` }"
            :class="getMemoryClass()"
          ></div>
        </div>
        <p>{{ formatMemory(currentMetrics?.memoryUsage) }} / 150MB</p>
      </div>

      <!-- 包分析 -->
      <div class="bundle-analysis">
        <h4>包分析</h4>
        <div class="bundle-stats">
          <div class="bundle-item">
            <span class="bundle-label">总大小</span>
            <span class="bundle-value">{{ formatSize(bundleAnalysis?.totalSize) }}</span>
          </div>
          <div class="bundle-item">
            <span class="bundle-label">Gzip 后</span>
            <span class="bundle-value">{{ formatSize(bundleAnalysis?.gzippedSize) }}</span>
          </div>
          <div class="bundle-item">
            <span class="bundle-label">代码块</span>
            <span class="bundle-value">{{ bundleAnalysis?.chunks.length || 0 }}</span>
          </div>
        </div>
        <div class="bundle-actions">
          <button @click="analyzeBundles" class="analyze-btn" :disabled="isAnalyzing">
            {{ isAnalyzing ? '分析中...' : '分析包' }}
          </button>
          <button @click="exportBundleReport" class="export-bundle-btn">
            导出报告
          </button>
        </div>
        
        <!-- 大依赖列表 -->
        <div v-if="largeDependencies.length > 0" class="large-dependencies">
          <h5>大依赖 (>100KB)</h5>
          <div class="dependency-list">
            <div 
              v-for="dep in largeDependencies.slice(0, 3)" 
              :key="dep.name"
              class="dependency-item"
            >
              <span class="dep-name">{{ dep.name }}</span>
              <span class="dep-size">{{ formatSize(dep.size) }}</span>
            </div>
          </div>
        </div>

        <!-- 优化建议 -->
        <div v-if="bundleRecommendations.length > 0" class="bundle-recommendations">
          <h5>优化建议</h5>
          <ul>
            <li v-for="(rec, index) in bundleRecommendations.slice(0, 2)" :key="index">
              <span class="rec-priority" :class="rec.priority">{{ rec.priority.toUpperCase() }}</span>
              {{ rec.description }}
            </li>
          </ul>
        </div>
      </div>

      <!-- API 响应时间 -->
      <div class="api-performance">
        <h4>API 性能</h4>
        <p>平均响应时间: {{ formatTime(currentMetrics?.apiResponseTime) }}</p>
      </div>

      <!-- 最近错误 -->
      <div v-if="recentErrors.length > 0" class="recent-errors">
        <h4>最近错误</h4>
        <div class="error-list">
          <div 
            v-for="error in recentErrors.slice(0, 3)" 
            :key="error.timestamp"
            class="error-item"
            :class="error.severity"
          >
            <span class="error-type">{{ error.type }}</span>
            <span class="error-message">{{ error.message }}</span>
            <span class="error-time">{{ formatErrorTime(error.timestamp) }}</span>
          </div>
        </div>
      </div>

      <!-- 性能建议 -->
      <div v-if="recommendations.length > 0" class="recommendations">
        <h4>性能建议</h4>
        <ul>
          <li v-for="(rec, index) in recommendations" :key="index">
            {{ rec }}
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { usePerformanceMonitor } from '../composables/usePerformanceMonitor'
import { bundleAnalyzer, type BundleAnalysis } from '../utils/bundleAnalyzer'

// 性能监控数据
const {
  currentMetrics,
  recentErrors,
  performanceScore,
  performanceGrade,
  hasPerformanceIssues,
  getPerformanceRecommendations,
  exportPerformanceReport
} = usePerformanceMonitor()

// 包分析数据
const bundleAnalysis = ref<BundleAnalysis | null>(null)
const isAnalyzing = ref(false)

// 仪表板状态
const showDashboard = ref(false)
const isExpanded = ref(true)

// 计算属性
const scoreClass = computed(() => {
  const score = performanceScore.value
  if (score >= 90) return 'excellent'
  if (score >= 80) return 'good'
  if (score >= 70) return 'fair'
  if (score >= 60) return 'poor'
  return 'critical'
})

const memoryPercentage = computed(() => {
  if (!currentMetrics.value?.memoryUsage) return 0
  return Math.min((currentMetrics.value.memoryUsage / 150) * 100, 100)
})

const recommendations = computed(() => {
  return getPerformanceRecommendations()
})

const largeDependencies = computed(() => {
  if (!bundleAnalysis.value) return []
  return bundleAnalysis.value.dependencies
    .filter(dep => dep.size > 100 * 1024) // >100KB
    .sort((a, b) => b.size - a.size)
})

const bundleRecommendations = computed(() => {
  if (!bundleAnalysis.value) return []
  return bundleAnalysis.value.recommendations
    .sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 }
      return priorityOrder[b.priority] - priorityOrder[a.priority]
    })
})

// 方法
const toggleDashboard = () => {
  isExpanded.value = !isExpanded.value
}

const closeDashboard = () => {
  showDashboard.value = false
}

const exportReport = () => {
  exportPerformanceReport()
}

// 包分析方法
const analyzeBundles = async () => {
  if (isAnalyzing.value) return
  
  isAnalyzing.value = true
  try {
    bundleAnalysis.value = await bundleAnalyzer.analyzeBuildStats()
    console.log('Bundle analysis completed:', bundleAnalysis.value)
  } catch (error) {
    console.error('Bundle analysis failed:', error)
    // 降级到运行时分析
    bundleAnalysis.value = bundleAnalyzer.analyzeRuntimeBundles()
  } finally {
    isAnalyzing.value = false
  }
}

const exportBundleReport = () => {
  if (!bundleAnalysis.value) return
  bundleAnalyzer.exportAnalysis(bundleAnalysis.value, 'html')
}

// 格式化函数
const formatTime = (time: number | null | undefined) => {
  if (!time) return 'N/A'
  return `${Math.round(time)}ms`
}

const formatCLS = (cls: number | null | undefined) => {
  if (!cls) return 'N/A'
  return cls.toFixed(3)
}

const formatMemory = (memory: number | undefined) => {
  if (!memory) return '0'
  return `${Math.round(memory)}MB`
}

const formatErrorTime = (timestamp: number) => {
  const now = Date.now()
  const diff = now - timestamp
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  const hours = Math.floor(minutes / 60)
  return `${hours}小时前`
}

const formatSize = (bytes: number | undefined) => {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// 性能等级样式
const getLCPClass = () => {
  const lcp = currentMetrics.value?.lcp
  if (!lcp) return ''
  if (lcp <= 2500) return 'good'
  if (lcp <= 4000) return 'fair'
  return 'poor'
}

const getFIDClass = () => {
  const fid = currentMetrics.value?.fid
  if (!fid) return ''
  if (fid <= 100) return 'good'
  if (fid <= 300) return 'fair'
  return 'poor'
}

const getCLSClass = () => {
  const cls = currentMetrics.value?.cls
  if (!cls) return ''
  if (cls <= 0.1) return 'good'
  if (cls <= 0.25) return 'fair'
  return 'poor'
}

const getMemoryClass = () => {
  const memory = currentMetrics.value?.memoryUsage
  if (!memory) return ''
  if (memory <= 100) return 'good'
  if (memory <= 130) return 'fair'
  return 'poor'
}

// 键盘快捷键
const handleKeyPress = (event: KeyboardEvent) => {
  // Ctrl/Cmd + Shift + P 切换性能面板
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'P') {
    event.preventDefault()
    showDashboard.value = !showDashboard.value
  }
}

onMounted(() => {
  // 只在开发环境显示
  if (import.meta.env.DEV) {
    document.addEventListener('keydown', handleKeyPress)
    
    // 延迟显示，避免影响初始加载
    setTimeout(() => {
      showDashboard.value = true
      // 自动进行一次包分析
      analyzeBundles()
    }, 2000)
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyPress)
})
</script>

<style scoped>
.performance-dashboard {
  position: fixed;
  top: 20px;
  right: 20px;
  width: 320px;
  background: rgba(0, 0, 0, 0.9);
  color: white;
  border-radius: 8px;
  padding: 16px;
  font-size: 12px;
  z-index: 9999;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.dashboard-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.dashboard-controls {
  display: flex;
  gap: 8px;
}

.dashboard-controls button {
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  transition: background 0.2s;
}

.dashboard-controls button:hover {
  background: rgba(255, 255, 255, 0.2);
}

.close-btn {
  width: 24px !important;
  height: 24px !important;
  padding: 0 !important;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px !important;
}

.performance-score {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.score-circle {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 3px solid;
}

.score-circle.excellent { border-color: #00ff00; }
.score-circle.good { border-color: #90ee90; }
.score-circle.fair { border-color: #ffff00; }
.score-circle.poor { border-color: #ffa500; }
.score-circle.critical { border-color: #ff0000; }

.score-value {
  font-size: 16px;
  font-weight: bold;
}

.score-grade {
  font-size: 10px;
  opacity: 0.8;
}

.score-details p {
  margin: 0;
  line-height: 1.4;
}

.warning {
  color: #ffa500;
  font-size: 11px;
}

.web-vitals, .memory-usage, .bundle-analysis, .api-performance, .recent-errors, .recommendations {
  margin-bottom: 16px;
}

.web-vitals h4, .memory-usage h4, .bundle-analysis h4, .api-performance h4, .recent-errors h4, .recommendations h4 {
  margin: 0 0 8px 0;
  font-size: 13px;
  font-weight: 600;
}

.vitals-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.vital-item {
  text-align: center;
  padding: 8px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
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
}

.vital-value.good { color: #00ff00; }
.vital-value.fair { color: #ffff00; }
.vital-value.poor { color: #ff0000; }

.memory-bar {
  width: 100%;
  height: 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 4px;
}

.memory-fill {
  height: 100%;
  transition: width 0.3s ease;
}

.memory-fill.good { background: #00ff00; }
.memory-fill.fair { background: #ffff00; }
.memory-fill.poor { background: #ff0000; }

.error-list {
  max-height: 120px;
  overflow-y: auto;
}

.error-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px;
  margin-bottom: 4px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
  border-left: 3px solid;
}

.error-item.low { border-left-color: #90ee90; }
.error-item.medium { border-left-color: #ffff00; }
.error-item.high { border-left-color: #ffa500; }
.error-item.critical { border-left-color: #ff0000; }

.error-type {
  font-weight: bold;
  font-size: 10px;
  text-transform: uppercase;
}

.error-message {
  font-size: 11px;
  opacity: 0.9;
}

.error-time {
  font-size: 10px;
  opacity: 0.6;
}

.recommendations ul {
  margin: 0;
  padding-left: 16px;
}

.recommendations li {
  margin-bottom: 4px;
  font-size: 11px;
  line-height: 1.4;
}

/* 响应式 */
@media (max-width: 768px) {
  .performance-dashboard {
    width: 280px;
    right: 10px;
    top: 10px;
  }
}

/* 包分析样式 */
.bundle-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 8px;
}

.bundle-item {
  text-align: center;
  padding: 6px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
}

.bundle-label {
  display: block;
  font-size: 10px;
  opacity: 0.7;
  margin-bottom: 2px;
}

.bundle-value {
  display: block;
  font-weight: bold;
  font-size: 11px;
}

.bundle-actions {
  display: flex;
  gap: 6px;
  margin-bottom: 12px;
}

.analyze-btn, .export-bundle-btn {
  flex: 1;
  background: rgba(0, 123, 255, 0.2);
  border: 1px solid rgba(0, 123, 255, 0.3);
  color: #007bff;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 10px;
  transition: all 0.2s;
}

.analyze-btn:hover, .export-bundle-btn:hover {
  background: rgba(0, 123, 255, 0.3);
}

.analyze-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.large-dependencies h5, .bundle-recommendations h5 {
  margin: 0 0 6px 0;
  font-size: 11px;
  font-weight: 600;
  opacity: 0.9;
}

.dependency-list {
  margin-bottom: 8px;
}

.dependency-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 6px;
  margin-bottom: 2px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 3px;
}

.dep-name {
  font-size: 10px;
  opacity: 0.9;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dep-size {
  font-size: 10px;
  font-weight: bold;
  color: #ffa500;
}

.bundle-recommendations ul {
  margin: 0;
  padding-left: 12px;
}

.bundle-recommendations li {
  margin-bottom: 4px;
  font-size: 10px;
  line-height: 1.3;
}

.rec-priority {
  display: inline-block;
  padding: 1px 4px;
  border-radius: 2px;
  font-size: 8px;
  font-weight: bold;
  margin-right: 4px;
}

.rec-priority.high {
  background: rgba(255, 0, 0, 0.2);
  color: #ff6b6b;
}

.rec-priority.medium {
  background: rgba(255, 165, 0, 0.2);
  color: #ffa500;
}

.rec-priority.low {
  background: rgba(0, 255, 0, 0.2);
  color: #90ee90;
}
</style>