<script setup lang="ts">
/**
 * 阅读器进度条组件
 */

interface Props {
  progress: number // 0 - 100
}

const props = defineProps<Props>()
</script>

<template>
  <div class="progress-track">
    <div 
      class="progress-fill" 
      :style="{ width: `${progress}%` }"
    />
  </div>
</template>

<style scoped>
.progress-track {
  height: 3px;
  background: rgba(var(--foreground-rgb), 0.05);
  border-radius: 99px;
  overflow: hidden;
  width: 100%;
}

.progress-fill {
  height: 100%;
  background: var(--primary);
  opacity: 0.6;
  border-radius: 99px;
  transition: width 0.3s ease;
}
</style>
