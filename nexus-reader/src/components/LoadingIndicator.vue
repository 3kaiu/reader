<template>
  <div class="loading-indicator" :class="[`loading-${type}`, `priority-${priority}`, { 'has-progress': showProgress }]">
    <!-- 主要加载动画 -->
    <div class="loading-animation">
      <div v-if="type === 'spinner'" class="spinner">
        <div class="spinner-ring"></div>
      </div>
      
      <div v-else-if="type === 'dots'" class="dots">
        <div class="dot" v-for="i in 3" :key="i" :style="{ animationDelay: `${i * 0.2}s` }"></div>
      </div>
      
      <div v-else-if="type === 'pulse'" class="pulse">
        <div class="pulse-circle"></div>
      </div>
      
      <div v-else-if="type === 'skeleton'" class="skeleton">
        <div class="skeleton-line" v-for="i in skeletonLines" :key="i" :style="getSkeletonStyle(i)"></div>
      </div>
      
      <div v-else-if="type === 'progress'" class="progress-bar">
        <div class="progress-fill" :style="{ width: `${progress}%` }"></div>
      </div>
    </div>

    <!-- 加载信息 -->
    <div v-if="showMessage" class="loading-info">
      <div class="loading-message">{{ message }}</div>
      <div v-if="showProgress" class="loading-progress">{{ Math.round(progress) }}%</div>
      <div v-if="showDetails && details" class="loading-details">{{ details }}</div>
    </div>

    <!-- 网络状态指示器 -->
    <div v-if="showNetworkStatus" class="network-status" :class="networkQuality">
      <span class="network-icon">{{ getNetworkIcon() }}</span>
      <span class="network-text">{{ getNetworkText() }}</span>
    </div>

    <!-- 取消按钮 -->
    <button v-if="cancellable" @click="handleCancel" class="cancel-btn">
      取消
    </button>

    <!-- 重试按钮 -->
    <button v-if="showRetry" @click="handleRetry" class="retry-btn">
      重试
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { networkDetector, type NetworkQuality } from '../services/network/optimizer'
import { progressiveLoader, type LoadingStatus, type LoadingPriority } from '../utils/progressiveLoader'

interface Props {
  type?: 'spinner' | 'dots' | 'pulse' | 'skeleton' | 'progress'
  priority?: LoadingPriority
  message?: string
  progress?: number
  showProgress?: boolean
  showMessage?: boolean
  showDetails?: boolean
  showNetworkStatus?: boolean
  cancellable?: boolean
  showRetry?: boolean
  skeletonLines?: number
  loadingId?: string
  autoUpdate?: boolean
  details?: string
}

const props = withDefaults(defineProps<Props>(), {
  type: 'spinner',
  priority: 'medium',
  message: '加载中...',
  progress: 0,
  showProgress: false,
  showMessage: true,
  showDetails: false,
  showNetworkStatus: false,
  cancellable: false,
  showRetry: false,
  skeletonLines: 3,
  autoUpdate: true
})

const emit = defineEmits<{
  cancel: []
  retry: []
  statusChange: [status: LoadingStatus]
}>()

// 响应式状态
const networkQuality = ref<NetworkQuality>('good')
const currentStatus = ref<LoadingStatus | null>(null)
const internalProgress = ref(props.progress)
const internalMessage = ref(props.message)

// 计算属性
const progress = computed(() => {
  if (currentStatus.value) {
    return currentStatus.value.progress
  }
  return internalProgress.value
})

const message = computed(() => {
  if (currentStatus.value) {
    return currentStatus.value.message
  }
  return internalMessage.value
})

const details = computed(() => {
  if (currentStatus.value?.details) {
    return JSON.stringify(currentStatus.value.details)
  }
  return props.details
})

// 方法
const handleCancel = () => {
  emit('cancel')
}

const handleRetry = () => {
  emit('retry')
}

const getNetworkIcon = () => {
  const icons = {
    excellent: '🚀',
    good: '📶',
    fair: '📱',
    poor: '🐌',
    offline: '📴'
  }
  return icons[networkQuality.value] || '📶'
}

const getNetworkText = () => {
  const texts = {
    excellent: '网络优秀',
    good: '网络良好',
    fair: '网络一般',
    poor: '网络较慢',
    offline: '网络离线'
  }
  return texts[networkQuality.value] || '网络状态'
}

const getSkeletonStyle = (index: number) => {
  const widths = ['100%', '80%', '60%', '90%', '70%']
  return {
    width: widths[index % widths.length],
    animationDelay: `${index * 0.1}s`
  }
}

const updateNetworkQuality = () => {
  networkQuality.value = networkDetector.getNetworkQuality()
}

const updateLoadingStatus = (status: LoadingStatus) => {
  currentStatus.value = status
  emit('statusChange', status)
}

// 生命周期
onMounted(() => {
  // 初始化网络质量
  updateNetworkQuality()
  
  // 监听网络变化
  networkDetector.addNetworkChangeListener(updateNetworkQuality)
  
  // 如果提供了loadingId，监听其状态变化
  if (props.loadingId && props.autoUpdate) {
    progressiveLoader.addStatusListener(props.loadingId, updateLoadingStatus)
  }
})

onUnmounted(() => {
  networkDetector.removeNetworkChangeListener(updateNetworkQuality)
  
  if (props.loadingId && props.autoUpdate) {
    progressiveLoader.removeStatusListener(props.loadingId, updateLoadingStatus)
  }
})

// 监听props变化
watch(() => props.progress, (newProgress) => {
  internalProgress.value = newProgress
})

watch(() => props.message, (newMessage) => {
  internalMessage.value = newMessage
})
</script>

<style scoped>
.loading-indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 20px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
}

.loading-indicator.priority-critical {
  border-left: 4px solid #ff4757;
}

.loading-indicator.priority-high {
  border-left: 4px solid #ffa502;
}

.loading-indicator.priority-medium {
  border-left: 4px solid #3742fa;
}

.loading-indicator.priority-low {
  border-left: 4px solid #747d8c;
}

/* 加载动画样式 */
.loading-animation {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 40px;
}

/* 旋转器 */
.spinner {
  width: 32px;
  height: 32px;
}

.spinner-ring {
  width: 100%;
  height: 100%;
  border: 3px solid #e0e0e0;
  border-top: 3px solid #3742fa;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* 点动画 */
.dots {
  display: flex;
  gap: 4px;
}

.dot {
  width: 8px;
  height: 8px;
  background: #3742fa;
  border-radius: 50%;
  animation: dot-bounce 1.4s ease-in-out infinite both;
}

@keyframes dot-bounce {
  0%, 80%, 100% {
    transform: scale(0);
  }
  40% {
    transform: scale(1);
  }
}

/* 脉冲动画 */
.pulse {
  width: 32px;
  height: 32px;
  position: relative;
}

.pulse-circle {
  width: 100%;
  height: 100%;
  background: #3742fa;
  border-radius: 50%;
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0% {
    transform: scale(0);
    opacity: 1;
  }
  100% {
    transform: scale(1);
    opacity: 0;
  }
}

/* 骨架屏 */
.skeleton {
  width: 200px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skeleton-line {
  height: 12px;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  border-radius: 4px;
  animation: skeleton-loading 1.5s ease-in-out infinite;
}

@keyframes skeleton-loading {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

/* 进度条 */
.progress-bar {
  width: 200px;
  height: 6px;
  background: #e0e0e0;
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #3742fa, #5352ed);
  border-radius: 3px;
  transition: width 0.3s ease;
  position: relative;
}

.progress-fill::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
  animation: progress-shine 2s ease-in-out infinite;
}

@keyframes progress-shine {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

/* 加载信息 */
.loading-info {
  text-align: center;
  color: #333;
}

.loading-message {
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 4px;
}

.loading-progress {
  font-size: 12px;
  color: #666;
  font-weight: 600;
}

.loading-details {
  font-size: 11px;
  color: #999;
  margin-top: 4px;
  max-width: 200px;
  word-break: break-all;
}

/* 网络状态 */
.network-status {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.05);
}

.network-status.excellent {
  background: rgba(0, 255, 0, 0.1);
  color: #27ae60;
}

.network-status.good {
  background: rgba(0, 123, 255, 0.1);
  color: #3742fa;
}

.network-status.fair {
  background: rgba(255, 193, 7, 0.1);
  color: #f39c12;
}

.network-status.poor {
  background: rgba(255, 87, 34, 0.1);
  color: #e74c3c;
}

.network-status.offline {
  background: rgba(108, 117, 125, 0.1);
  color: #6c757d;
}

/* 按钮样式 */
.cancel-btn,
.retry-btn {
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.cancel-btn {
  background: #e74c3c;
  color: white;
}

.cancel-btn:hover {
  background: #c0392b;
}

.retry-btn {
  background: #3742fa;
  color: white;
}

.retry-btn:hover {
  background: #2f3542;
}

/* 响应式 */
@media (max-width: 768px) {
  .loading-indicator {
    padding: 16px;
    gap: 10px;
  }
  
  .skeleton {
    width: 150px;
  }
  
  .progress-bar {
    width: 150px;
  }
  
  .loading-details {
    max-width: 150px;
  }
}

/* 暗色主题 */
@media (prefers-color-scheme: dark) {
  .loading-indicator {
    background: rgba(30, 30, 30, 0.95);
    color: #e0e0e0;
  }
  
  .loading-info {
    color: #e0e0e0;
  }
  
  .loading-details {
    color: #999;
  }
  
  .spinner-ring {
    border-color: #444;
    border-top-color: #3742fa;
  }
  
  .skeleton-line {
    background: linear-gradient(90deg, #333 25%, #444 50%, #333 75%);
  }
  
  .progress-bar {
    background: #444;
  }
}
</style>