<script setup lang="ts">
/**
 * 解密状态指示器组件
 * 固定在屏幕底部，显示解密状态
 */
import { computed } from 'vue'
import { Loader2, Sparkles, AlertCircle, RefreshCw } from 'lucide-vue-next'

interface Props {
  /** 是否正在解码 */
  isDecoding: boolean
  /** 错误信息 */
  error: string | null
  /** 识别的实体数量 */
  entitiesCount: number
  /** 是否已完成解码 */
  hasDecoded: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  retry: []
}>()

/** 状态类型 */
const statusType = computed(() => {
  if (props.isDecoding) return 'loading'
  if (props.error) return 'error'
  if (props.hasDecoded && props.entitiesCount > 0) return 'success'
  if (props.hasDecoded) return 'empty'
  return 'idle'
})
</script>

<template>
  <Transition name="slide-up">
    <div
      v-if="statusType !== 'idle'"
      class="decoder-status fixed bottom-20 right-4 z-40"
    >
      <!-- 加载中 -->
      <div
        v-if="statusType === 'loading'"
        class="flex items-center gap-2 px-3 py-2 bg-background/80 backdrop-blur border border-border rounded-full shadow-lg"
      >
        <Loader2 class="w-4 h-4 animate-spin text-primary" />
        <span class="text-xs">解密中...</span>
      </div>

      <!-- 错误 -->
      <div
        v-else-if="statusType === 'error'"
        class="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-full shadow-lg cursor-pointer hover:bg-red-500/15 transition-colors"
        @click="emit('retry')"
      >
        <AlertCircle class="w-4 h-4 text-red-500" />
        <span class="text-xs text-red-500">解密失败</span>
        <RefreshCw class="w-3 h-3 text-red-500" />
      </div>

      <!-- 成功 -->
      <div
        v-else-if="statusType === 'success'"
        class="flex items-center gap-2 px-3 py-2 bg-green-500/10 border border-green-500/20 rounded-full shadow-lg"
      >
        <Sparkles class="w-4 h-4 text-green-500" />
        <span class="text-xs text-green-600 dark:text-green-400">
          发现 {{ entitiesCount }} 个加密词
        </span>
      </div>

      <!-- 无结果 -->
      <div
        v-else-if="statusType === 'empty'"
        class="flex items-center gap-2 px-3 py-2 bg-muted/80 backdrop-blur border border-border rounded-full shadow-lg"
      >
        <Sparkles class="w-4 h-4 opacity-40" />
        <span class="text-xs opacity-60">未发现加密词</span>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.decoder-status {
  transition: all 0.3s ease;
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.3s ease, opacity 0.3s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(20px);
  opacity: 0;
}
</style>
