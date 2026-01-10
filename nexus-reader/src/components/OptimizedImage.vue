<template>
  <div class="optimized-image" :class="{ loading: isLoading, error: hasError }">
    <img
      v-if="!hasError"
      :src="optimizedSrc"
      :alt="alt"
      :loading="lazyLoad ? 'lazy' : 'eager'"
      @load="handleLoad"
      @error="handleError"
      :style="imageStyle"
      class="image"
    />
    
    <!-- 加载状态 -->
    <div v-if="isLoading" class="loading-placeholder">
      <div class="loading-spinner"></div>
      <span class="loading-text">{{ loadingText }}</span>
    </div>
    
    <!-- 错误状态 -->
    <div v-if="hasError" class="error-placeholder">
      <div class="error-icon">📷</div>
      <span class="error-text">{{ errorText }}</span>
      <button v-if="allowRetry" @click="retry" class="retry-btn">重试</button>
    </div>
    
    <!-- 网络质量指示器 -->
    <div v-if="showNetworkIndicator && networkQuality" class="network-indicator" :class="networkQuality">
      {{ getNetworkIndicatorText() }}
    </div>
    
    <!-- 渐进式加载效果 -->
    <div v-if="progressive && isLoading" class="progressive-overlay"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { adaptiveImageQuality, networkDetector, type NetworkQuality } from '../utils/networkOptimizer'
import { imageCache } from '../utils/cacheManager'

interface Props {
  src: string
  alt?: string
  width?: number
  height?: number
  quality?: number
  format?: 'webp' | 'jpeg' | 'png' | 'auto'
  lazyLoad?: boolean
  progressive?: boolean
  allowRetry?: boolean
  showNetworkIndicator?: boolean
  loadingText?: string
  errorText?: string
  cacheKey?: string
}

const props = withDefaults(defineProps<Props>(), {
  alt: '',
  lazyLoad: true,
  progressive: true,
  allowRetry: true,
  showNetworkIndicator: false,
  loadingText: '加载中...',
  errorText: '图片加载失败'
})

// 响应式状态
const isLoading = ref(true)
const hasError = ref(false)
const networkQuality = ref<NetworkQuality>('good')
const retryCount = ref(0)
const maxRetries = 3

// 计算属性
const optimizedSrc = computed(() => {
  if (!props.src) return ''
  
  const options = {
    quality: props.quality,
    maxWidth: props.width,
    maxHeight: props.height,
    format: props.format
  }
  
  return adaptiveImageQuality.optimizeImageUrl(props.src, options)
})

const imageStyle = computed(() => {
  const style: Record<string, string> = {}
  
  if (props.width) {
    style.width = `${props.width}px`
  }
  
  if (props.height) {
    style.height = `${props.height}px`
  }
  
  return style
})

// 方法
const handleLoad = () => {
  isLoading.value = false
  hasError.value = false
  
  // 缓存成功加载的图片
  if (props.cacheKey) {
    imageCache.set(props.cacheKey, optimizedSrc.value)
  }
  
  console.log('🖼️ Image loaded successfully:', optimizedSrc.value)
}

const handleError = () => {
  isLoading.value = false
  hasError.value = true
  
  console.error('🖼️ Image load failed:', optimizedSrc.value)
  
  // 自动重试（如果允许）
  if (props.allowRetry && retryCount.value < maxRetries) {
    setTimeout(() => {
      retry()
    }, 1000 * Math.pow(2, retryCount.value)) // 指数退避
  }
}

const retry = () => {
  if (retryCount.value >= maxRetries) {
    console.warn('🖼️ Max retries reached for image:', props.src)
    return
  }
  
  retryCount.value++
  isLoading.value = true
  hasError.value = false
  
  console.log(`🔄 Retrying image load (attempt ${retryCount.value}):`, props.src)
}

const getNetworkIndicatorText = () => {
  const indicators = {
    excellent: '🚀',
    good: '📶',
    fair: '📱',
    poor: '🐌',
    offline: '📴'
  }
  return indicators[networkQuality.value] || '📶'
}

// 预加载图片
const preloadImage = async () => {
  if (!props.src) return
  
  try {
    // 检查缓存
    if (props.cacheKey && imageCache.has(props.cacheKey)) {
      console.log('🖼️ Image served from cache:', props.cacheKey)
      return
    }
    
    // 使用自适应图片质量预加载
    await adaptiveImageQuality.preloadImage(props.src, {
      quality: props.quality,
      maxWidth: props.width,
      maxHeight: props.height,
      format: props.format
    })
    
    console.log('🖼️ Image preloaded:', props.src)
  } catch (error) {
    console.warn('🖼️ Image preload failed:', props.src, error)
  }
}

// 监听网络质量变化
const updateNetworkQuality = () => {
  networkQuality.value = networkDetector.getNetworkQuality()
}

// 生命周期
onMounted(() => {
  // 初始化网络质量
  updateNetworkQuality()
  
  // 监听网络变化
  networkDetector.addNetworkChangeListener(updateNetworkQuality)
  
  // 如果不是懒加载，立即预加载
  if (!props.lazyLoad) {
    preloadImage()
  }
})

onUnmounted(() => {
  networkDetector.removeNetworkChangeListener(updateNetworkQuality)
})

// 监听src变化
watch(() => props.src, () => {
  isLoading.value = true
  hasError.value = false
  retryCount.value = 0
}, { immediate: true })
</script>

<style scoped>
.optimized-image {
  position: relative;
  display: inline-block;
  overflow: hidden;
  background-color: #f5f5f5;
  border-radius: 4px;
}

.image {
  display: block;
  max-width: 100%;
  height: auto;
  transition: opacity 0.3s ease;
}

.loading .image {
  opacity: 0;
}

.loading-placeholder {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: #666;
}

.loading-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid #e0e0e0;
  border-top: 2px solid #007acc;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.loading-text {
  font-size: 12px;
  opacity: 0.7;
}

.error-placeholder {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: #999;
  text-align: center;
  padding: 16px;
}

.error-icon {
  font-size: 32px;
  opacity: 0.5;
}

.error-text {
  font-size: 12px;
  opacity: 0.7;
}

.retry-btn {
  background: #007acc;
  color: white;
  border: none;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.2s;
}

.retry-btn:hover {
  background: #005a9e;
}

.network-indicator {
  position: absolute;
  top: 4px;
  right: 4px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 2px 6px;
  border-radius: 12px;
  font-size: 10px;
  backdrop-filter: blur(4px);
}

.network-indicator.excellent {
  background: rgba(0, 255, 0, 0.8);
}

.network-indicator.good {
  background: rgba(0, 123, 255, 0.8);
}

.network-indicator.fair {
  background: rgba(255, 193, 7, 0.8);
}

.network-indicator.poor {
  background: rgba(255, 87, 34, 0.8);
}

.network-indicator.offline {
  background: rgba(108, 117, 125, 0.8);
}

.progressive-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(45deg, 
    rgba(255, 255, 255, 0.1) 25%, 
    transparent 25%, 
    transparent 50%, 
    rgba(255, 255, 255, 0.1) 50%, 
    rgba(255, 255, 255, 0.1) 75%, 
    transparent 75%
  );
  background-size: 20px 20px;
  animation: progressive-loading 1s linear infinite;
}

@keyframes progressive-loading {
  0% { background-position: 0 0; }
  100% { background-position: 20px 20px; }
}

/* 响应式 */
@media (max-width: 768px) {
  .loading-placeholder,
  .error-placeholder {
    padding: 12px;
  }
  
  .error-icon {
    font-size: 24px;
  }
  
  .loading-text,
  .error-text {
    font-size: 11px;
  }
}
</style>