<script setup lang="ts">
/**
 * 💡 SmartRecap - 剧情回顾组件
 * 在用户回到书籍时，自动生成前情提要
 */
import { ref, onMounted } from 'vue'
import { Sparkles, X, ChevronRight, Loader2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { useAIStore } from '@/stores/ai'
import { logger } from '@/utils/logger'

const props = defineProps<{
  bookTitle?: string
  lastChapters: Array<{ title: string, content: string }>
}>()

const emit = defineEmits<{
  'close': []
}>()

const aiStore = useAIStore()
const recapText = ref('')
const isLoading = ref(false)
const isVisible = ref(false)

async function generate() {
  if (props.lastChapters.length === 0) return
  
  isLoading.value = true
  isVisible.value = true
  
  try {
    recapText.value = ''
    await aiStore.generateSmartRecap(props.lastChapters, (token) => {
      recapText.value += token
    })
  } catch (e) {
    logger.error('生成剧情回顾失败', e as Error)
    recapText.value = '抱歉，回顾生成失败。你可以直接开始阅读。'
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  // 自动延迟显示，避免干扰首屏加载
  setTimeout(() => {
    generate()
  }, 1500)
})
</script>

<template>
  <Transition name="slide-up">
    <div v-if="isVisible" class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] w-[90vw] max-w-md">
      <div class="bg-card/95 backdrop-blur-xl border border-primary/20 rounded-3xl shadow-2xl overflow-hidden p-6 ring-1 ring-black/5">
        <!-- 头部 -->
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Sparkles class="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 class="text-sm font-bold tracking-tight">剧情回溯</h3>
              <p class="text-[10px] text-muted-foreground uppercase tracking-widest">{{ bookTitle }}</p>
            </div>
          </div>
          <button @click="isVisible = false; emit('close')" class="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center transition-colors">
            <X class="w-4 h-4 opacity-50" />
          </button>
        </div>

        <!-- 内容 -->
        <div class="relative min-h-[100px]">
          <div v-if="isLoading && !recapText" class="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <Loader2 class="w-6 h-6 animate-spin text-primary/40" />
            <p class="text-xs text-muted-foreground animate-pulse">正在为您穿梭时空，找回记忆...</p>
          </div>
          
          <div class="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
            {{ recapText }}
            <span v-if="isLoading && recapText" class="inline-block w-1 h-4 bg-primary animate-pulse ml-0.5" />
          </div>
        </div>

        <!-- 底部操作 -->
        <div class="mt-6 flex gap-3">
          <Button class="flex-1 rounded-2xl h-11" @click="isVisible = false; emit('close')">
            接着读
            <ChevronRight class="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.slide-up-enter-active, .slide-up-leave-active {
  transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}
.slide-up-enter-from, .slide-up-leave-to {
  opacity: 0;
  transform: translate(-50%, 20px) scale(0.95);
}
</style>
