<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { Sparkles, Loader2, RefreshCw, Zap } from 'lucide-vue-next'
import { useAIStore } from '@/stores/ai'
import { useSettingsStore } from '@/stores/settings'
import { getCache, setCache } from '@/composables/useAICache'
import { useReaderStore } from '@/stores/reader'
import { logger } from '@/utils/logger'

const props = defineProps<{
  chapter: {
    index: number
    title: string
    content: string
    bookUrl?: string 
  }
}>()

const aiStore = useAIStore()
const settingsStore = useSettingsStore()
const readerStore = useReaderStore()

const summary = ref('')
const isLoading = ref(false)
const error = ref('')
const isGenerated = ref(false)

// 获取唯一标识
const bookUrl = props.chapter.bookUrl || readerStore.currentBook?.bookUrl

const isMountedRef = ref(false)

async function loadSummary(force = false) {
  if (!settingsStore.config.autoSummary && !force) return
  if (!bookUrl) return
  if (!aiStore.isModelLoaded) return

  isLoading.value = true
  error.value = ''
  
  try {
    // 1. 检查缓存
    if (!force) {
      const cached = await getCache(bookUrl, props.chapter.index, 'summary')
      if (cached) {
        summary.value = cached.result as string
        isLoading.value = false
        isGenerated.value = true
        return
      }
    }
    
    // 2. 生成摘要
    await aiStore.summarizeChapter(
      props.chapter.content,
      props.chapter.title,
      (text) => { 
        if (isMountedRef.value) {
            summary.value = text 
        }
      }
    )
    
    // 3. 保存缓存
    if (isMountedRef.value) {
        await setCache(bookUrl, props.chapter.index, 'summary', summary.value)
        isGenerated.value = true
    }
    
  } catch (e) {
    if (isMountedRef.value) error.value = '生成失败'
    logger.error('生成章节摘要失败', e as Error, { function: 'ChapterSummary', chapterIndex: props.chapter.index })
  } finally {
    if (isMountedRef.value) isLoading.value = false
  }
}

// 监听可见性或自动触发
onMounted(() => {
  isMountedRef.value = true
  // 如果开启了自动摘要，且模型已加载，则尝试加载
  if (settingsStore.config.autoSummary && aiStore.isModelLoaded) {
    loadSummary()
  }
})

onUnmounted(() => {
  isMountedRef.value = false
})

// 监听 AI 模型加载状态
watch(() => aiStore.isModelLoaded, (loaded) => {
  if (loaded && settingsStore.config.autoSummary && !summary.value && !isLoading.value && isMountedRef.value) {
    loadSummary()
  }
})

function handleRegenerate() {
  loadSummary(true)
}
</script>

<template>
  <div 
    v-if="settingsStore.config.autoSummary || summary" 
    class="mx-4 mb-8 p-4 rounded-xl bg-primary/5 border border-primary/10 relative group"
  >
    <!-- 标题栏 -->
    <div class="flex items-center gap-2 mb-2 text-primary/80 font-medium text-sm">
      <Sparkles class="w-4 h-4" />
      <span>智能摘要</span>
      
      <!-- 加载中 -->
      <span v-if="isLoading" class="flex items-center text-xs opacity-60 ml-2">
         <Loader2 class="w-3 h-3 animate-spin mr-1" />
         生成中...
      </span>
      
      <!-- 重新生成按钮 -->
      <button 
        v-if="!isLoading && summary"
        class="ml-auto p-1.5 rounded-full hover:bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity"
        title="重新生成"
        @click="handleRegenerate"
      >
        <RefreshCw class="w-3.5 h-3.5" />
      </button>
    </div>
    
    <!-- 内容区域 -->
    <div class="text-sm leading-relaxed opacity-90 text-justify">
      <div v-if="summary">{{ summary }}</div>
      
      <!-- 空状态/未加载 -->
      <div v-else-if="!isLoading && !summary" class="flex flex-col items-center py-4 text-center">
         <div v-if="!aiStore.isModelLoaded" class="text-xs opacity-50 mb-2">
           AI 模型未加载
         </div>
         <button 
           class="flex items-center gap-1.5 text-xs text-primary border border-primary/20 px-3 py-1.5 rounded-full hover:bg-primary/10 transition-colors"
           @click="loadSummary(true)"
         >
           <Zap class="w-3.5 h-3.5" />
           生成本章摘要
         </button>
      </div>

      <!-- 错误提示 -->
      <div v-if="error" class="text-xs text-red-500 mt-2">
        {{ error }}
        <button class="underline ml-2" @click="loadSummary(true)">重试</button>
      </div>
    </div>
  </div>
</template>
