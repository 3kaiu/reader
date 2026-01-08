<script setup lang="ts">
/**
 * ErrorBoundary - 全局错误边界组件
 * 捕获子组件树中的渲染错误，提供优雅降级
 */
import { ref, onErrorCaptured } from 'vue'

const hasError = ref(false)
const errorMessage = ref('')

// 捕获子组件错误
onErrorCaptured((err, instance, info) => {
  hasError.value = true
  errorMessage.value = err instanceof Error ? err.message : String(err)
  
  // 记录错误日志
  console.error('[ErrorBoundary]', err, info)
  
  // 返回 false 阻止错误继续传播
  return false
})

const retry = () => {
  hasError.value = false
  errorMessage.value = ''
}
</script>

<template>
  <div v-if="hasError" class="error-boundary">
    <div class="error-content">
      <div class="error-icon">⚠️</div>
      <h2>页面出现了问题</h2>
      <p class="error-msg">{{ errorMessage || '未知错误' }}</p>
      <button @click="retry" class="retry-btn">
        重试
      </button>
    </div>
  </div>
  <slot v-else />
</template>

<style scoped>
.error-boundary {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  padding: 2rem;
}

.error-content {
  text-align: center;
  max-width: 400px;
}

.error-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.error-content h2 {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: var(--foreground);
}

.error-msg {
  font-size: 0.875rem;
  color: var(--muted-foreground);
  margin-bottom: 1.5rem;
  word-break: break-word;
}

.retry-btn {
  padding: 0.5rem 1.5rem;
  border-radius: 0.375rem;
  background: var(--primary);
  color: var(--primary-foreground);
  font-size: 0.875rem;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: opacity 0.2s;
}

.retry-btn:hover {
  opacity: 0.9;
}
</style>
