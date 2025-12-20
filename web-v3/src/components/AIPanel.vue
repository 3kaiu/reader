<script setup lang="ts">
/**
 * AI 助手面板（阅读器内）
 * 仅提供 AI 功能入口，模型管理在设置页面
 */
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAI } from '@/composables/useAI'
import { useReaderStore } from '@/stores/reader'
import { Brain, Sparkles, X, Loader2, MessageSquare, FileText, Users, RefreshCw, Settings } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

const props = withDefaults(defineProps<{
  open?: boolean
}>(), {
  open: false
})

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const router = useRouter()
const ai = useAI()
const readerStore = useReaderStore()

// 状态
const activeTab = ref<'summary' | 'homophone' | 'chat'>('summary')
const summaryResult = ref('')
const homophoneResult = ref<Array<{ original: string; guess: string; confidence: number }>>([])
const chatInput = ref('')
const chatResult = ref('')
const isProcessing = ref(false)

// 初始化检测
watch(() => props.open, async (open) => {
  if (open) {
    await ai.checkSupport()
  }
})

// 跳转到设置页面
function goToSettings() {
  emit('update:open', false)
  router.push('/ai-settings')
}

// 生成摘要
async function generateSummary() {
  if (!ai.isModelLoaded.value || !readerStore.content) return
  
  isProcessing.value = true
  summaryResult.value = ''
  
  try {
    summaryResult.value = await ai.summarizeChapter(
      readerStore.content,
      readerStore.currentChapter?.title
    )
  } catch (e) {
    summaryResult.value = `错误: ${e instanceof Error ? e.message : '未知错误'}`
  } finally {
    isProcessing.value = false
  }
}

// 检测谐音
async function detectHomophones() {
  if (!ai.isModelLoaded.value || !readerStore.content) return
  
  isProcessing.value = true
  homophoneResult.value = []
  
  try {
    homophoneResult.value = await ai.detectHomophones(readerStore.content)
  } catch (e) {
    console.error('谐音检测失败:', e)
  } finally {
    isProcessing.value = false
  }
}

// 智能问答
async function askQuestion() {
  if (!ai.isModelLoaded.value || !chatInput.value.trim() || !readerStore.content) return
  
  isProcessing.value = true
  chatResult.value = ''
  
  try {
    await ai.askAboutBook(
      chatInput.value,
      readerStore.content,
      (text: string) => { chatResult.value = text }
    )
  } catch (e) {
    chatResult.value = `错误: ${e instanceof Error ? e.message : '未知错误'}`
  } finally {
    isProcessing.value = false
  }
}
</script>

<template>
  <Sheet :open="open" @update:open="emit('update:open', $event)">
    <SheetContent side="right" class="w-[400px] sm:w-[450px] overflow-y-auto">
      <SheetHeader class="mb-4">
        <div class="flex items-center justify-between">
          <SheetTitle class="flex items-center gap-2">
            <Brain class="h-5 w-5 text-primary" />
            AI 助手
          </SheetTitle>
          <Button variant="ghost" size="sm" @click="goToSettings">
            <Settings class="h-4 w-4 mr-1" />
            模型
          </Button>
        </div>
      </SheetHeader>

      <!-- WebGPU 不支持提示 -->
      <div v-if="!ai.isSupported.value" class="p-4 rounded-xl bg-destructive/10 text-destructive text-sm">
        <p class="font-medium mb-1">⚠️ 不支持 WebGPU</p>
        <p class="opacity-80">您的浏览器不支持 WebGPU，请使用 Chrome 113+ 或 Edge 113+。</p>
      </div>

      <!-- 模型未加载 -->
      <div v-else-if="!ai.isModelLoaded.value" class="py-12 text-center">
        <div class="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
          <Brain class="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 class="font-medium mb-2">尚未加载 AI 模型</h3>
        <p class="text-sm text-muted-foreground mb-4">
          请先下载 AI 模型才能使用智能功能
        </p>
        <Button @click="goToSettings">
          <Settings class="h-4 w-4 mr-2" />
          去下载模型
        </Button>
      </div>

      <!-- 模型已加载 - 功能面板 -->
      <div v-else class="space-y-4">
        <!-- 模型状态 -->
        <div class="flex items-center justify-between p-3 rounded-xl bg-muted/50">
          <div class="flex items-center gap-2">
            <div class="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span class="text-xs text-muted-foreground">{{ ai.currentModel.value?.split('-').slice(0, 2).join(' ') }}</span>
          </div>
        </div>

        <!-- 功能标签页 -->
        <div class="flex gap-1 p-1 rounded-xl bg-muted">
          <button
            class="flex-1 py-2 px-3 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
            :class="activeTab === 'summary' ? 'bg-background shadow-sm' : 'hover:bg-background/50'"
            @click="activeTab = 'summary'"
          >
            <FileText class="w-4 h-4" />
            摘要
          </button>
          <button
            class="flex-1 py-2 px-3 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
            :class="activeTab === 'homophone' ? 'bg-background shadow-sm' : 'hover:bg-background/50'"
            @click="activeTab = 'homophone'"
          >
            <Users class="w-4 h-4" />
            谐音
          </button>
          <button
            class="flex-1 py-2 px-3 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
            :class="activeTab === 'chat' ? 'bg-background shadow-sm' : 'hover:bg-background/50'"
            @click="activeTab = 'chat'"
          >
            <MessageSquare class="w-4 h-4" />
            问答
          </button>
        </div>

        <!-- 摘要功能 -->
        <div v-if="activeTab === 'summary'" class="space-y-4">
          <Button 
            class="w-full" 
            :disabled="isProcessing"
            @click="generateSummary"
          >
            <Sparkles v-if="!isProcessing" class="w-4 h-4 mr-2" />
            <Loader2 v-else class="w-4 h-4 mr-2 animate-spin" />
            生成本章摘要
          </Button>
          
          <div v-if="summaryResult" class="p-4 rounded-xl bg-muted/50 text-sm leading-relaxed">
            {{ summaryResult }}
          </div>
        </div>

        <!-- 谐音识别 -->
        <div v-if="activeTab === 'homophone'" class="space-y-4">
          <Button 
            class="w-full" 
            :disabled="isProcessing"
            @click="detectHomophones"
          >
            <RefreshCw v-if="!isProcessing" class="w-4 h-4 mr-2" />
            <Loader2 v-else class="w-4 h-4 mr-2 animate-spin" />
            分析本章谐音
          </Button>
          
          <div v-if="homophoneResult.length > 0" class="space-y-2">
            <div
              v-for="(item, index) in homophoneResult"
              :key="index"
              class="p-3 rounded-xl bg-muted/50 flex items-center justify-between"
            >
              <div>
                <span class="text-sm font-medium">{{ item.original }}</span>
                <span class="text-muted-foreground mx-2">→</span>
                <span class="text-sm text-primary font-medium">{{ item.guess }}</span>
              </div>
              <span class="text-xs text-muted-foreground">
                {{ Math.round(item.confidence * 100) }}%
              </span>
            </div>
          </div>
          
          <div v-else-if="!isProcessing" class="text-center py-6 text-sm text-muted-foreground">
            点击上方按钮开始分析华娱/同人小说中的谐音
          </div>
        </div>

        <!-- 智能问答 -->
        <div v-if="activeTab === 'chat'" class="space-y-4">
          <div class="flex gap-2">
            <input
              v-model="chatInput"
              type="text"
              placeholder="问我关于这本书的问题..."
              class="flex-1 px-4 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              @keyup.enter="askQuestion"
            />
            <Button :disabled="isProcessing || !chatInput.trim()" @click="askQuestion">
              <MessageSquare class="w-4 h-4" />
            </Button>
          </div>
          
          <div v-if="chatResult" class="p-4 rounded-xl bg-muted/50 text-sm leading-relaxed whitespace-pre-wrap">
            {{ chatResult }}
          </div>
        </div>
      </div>
    </SheetContent>
  </Sheet>
</template>
