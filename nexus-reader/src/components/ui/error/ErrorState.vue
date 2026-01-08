<script setup lang="ts">
import { AlertCircle, RefreshCw, ArrowLeft } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'

interface Props {
  title?: string
  message?: string
  showRetry?: boolean
  showBack?: boolean
  retryText?: string
  backText?: string
}

const props = withDefaults(defineProps<Props>(), {
  title: '加载失败',
  message: '发生了错误，请稍后重试',
  showRetry: true,
  showBack: false,
  retryText: '重试',
  backText: '返回',
})

const emit = defineEmits<{
  retry: []
  back: []
}>()
</script>

<template>
  <div class="flex flex-col items-center justify-center py-20 px-6 text-center animate-in fade-in zoom-in-95 duration-500">
    <!-- 错误图标 -->
    <div class="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-6">
      <AlertCircle class="w-10 h-10 text-destructive" />
    </div>
    
    <!-- 错误信息 -->
    <h2 class="text-lg font-semibold mb-2 text-foreground">{{ title }}</h2>
    <p class="text-sm text-muted-foreground mb-8 max-w-md">{{ message }}</p>
    
    <!-- 操作按钮 -->
    <div class="flex gap-3">
      <Button
        v-if="showRetry"
        @click="emit('retry')"
        variant="default"
        class="rounded-full"
      >
        <RefreshCw class="w-4 h-4 mr-2" />
        {{ retryText }}
      </Button>
      <Button
        v-if="showBack"
        @click="emit('back')"
        variant="outline"
        class="rounded-full"
      >
        <ArrowLeft class="w-4 h-4 mr-2" />
        {{ backText }}
      </Button>
    </div>
  </div>
</template>
