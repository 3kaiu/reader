<script setup lang="ts">
/**
 * AI 助手面板（阅读器内）
 * 仅提供 AI 功能入口，模型管理在设置页面
 */
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAIStore } from '@/stores/ai'
import { useReaderStore } from '@/stores/reader'
import { getCache, setCache } from '@/composables/useAICache'
import { exportAIAnalysis, downloadMarkdown } from '@/utils/aiExport'
import { useMessage } from '@/composables/useMessage'
import { logger } from '@/utils/logger'
import { Brain, Sparkles, Loader2, MessageSquare, FileText, Users, RefreshCw, Settings, Database, History, Zap, Clock, Hash, Download, BookMarked, Drama, Network } from 'lucide-vue-next'
import type { SlangItem, MemeItem, CharacterGraph } from '@/types/ai'
import CharacterGraphViz from '@/components/CharacterGraph.vue'
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
const aiStore = useAIStore()
const readerStore = useReaderStore()
const { success, error: showError } = useMessage()

// 状态
const activeTab = ref<'summary' | 'homophone' | 'chat' | 'recap' | 'slang' | 'memes' | 'graph'>('summary')
const summaryResult = ref('')
const recapResult = ref('')
const homophoneResult = ref<Array<{ original: string; guess: string; confidence: number }>>([])
const slangResult = ref<SlangItem[]>([])
const memesResult = ref<MemeItem[]>([])
const graphResult = ref<CharacterGraph>({ nodes: [], edges: [] })
const chatInput = ref('')
const chatResult = ref('')
const isProcessing = ref(false)
const isStreaming = ref(false)
const fromCache = ref(false) // 结果来自缓存
const hasAnalyzed = ref(false) // 是否执行过分析

// 初始化检测
watch(() => props.open, async (open) => {
  if (open) {
    await aiStore.checkSupport()
  }
})

// 跳转到设置页面
function goToSettings() {
  emit('update:open', false)
  router.push('/ai-settings')
}

// 生成摘要
async function generateSummary(forceRefresh = false) {
  if (!aiStore.isModelLoaded || !readerStore.content) return
  
  const bookUrl = readerStore.currentBook?.bookUrl
  const chapterIndex = readerStore.currentChapterIndex
  
  // 检查缓存
  if (!forceRefresh && bookUrl) {
    const cached = await getCache(bookUrl, chapterIndex, 'summary')
    if (cached) {
      summaryResult.value = cached.result as string
      fromCache.value = true
      return
    }
  }
  
  isProcessing.value = true
  isStreaming.value = true
  fromCache.value = false
  summaryResult.value = ''
  
  try {
    await aiStore.summarizeChapter(
      readerStore.content,
      readerStore.currentChapter?.title,
      (text: string) => { summaryResult.value = text }
    )
    
    // 保存到缓存
    if (bookUrl && summaryResult.value) {
      await setCache(bookUrl, chapterIndex, 'summary', summaryResult.value)
    }
  } catch (e) {
    summaryResult.value = `错误: ${e instanceof Error ? e.message : '未知错误'}`
  } finally {
    isProcessing.value = false
    isStreaming.value = false
  }
}

// 检测谐音
async function detectHomophones(forceRefresh = false) {
  if (!aiStore.isModelLoaded || !readerStore.content) return
  
  const bookUrl = readerStore.currentBook?.bookUrl
  const chapterIndex = readerStore.currentChapterIndex
  
  // 检查缓存
  if (!forceRefresh && bookUrl) {
    const cached = await getCache(bookUrl, chapterIndex, 'homophone')
    if (cached) {
      homophoneResult.value = cached.result as any[]
      fromCache.value = true
      hasAnalyzed.value = true
      return
    }
  }
  
  isProcessing.value = true
  fromCache.value = false
  hasAnalyzed.value = false
  homophoneResult.value = []
  
  try {
    homophoneResult.value = await aiStore.detectHomophones(readerStore.content)
    hasAnalyzed.value = true
    
    // 保存到缓存
    if (bookUrl && homophoneResult.value.length > 0) {
      await setCache(bookUrl, chapterIndex, 'homophone', homophoneResult.value)
    }
  } catch (e) {
    logger.error('谐音检测失败', e as Error, { function: 'AIPanel.detectHomophones' })
  } finally {
    isProcessing.value = false
  }
}

// 智能问答
async function askQuestion() {
  if (!aiStore.isModelLoaded || !chatInput.value.trim() || !readerStore.content) return
  
  const question = chatInput.value.trim()
  chatInput.value = '' // 清空输入框
  
  isProcessing.value = true
  isStreaming.value = true
  chatResult.value = ''
  
  try {
    await aiStore.askAboutBook(
      question,
      readerStore.content,
      {
        useHistory: true,
        onStream: (text: string) => { chatResult.value = text }
      }
    )
  } catch (e) {
    chatResult.value = `错误: ${e instanceof Error ? e.message : '未知错误'}`
  } finally {
    isProcessing.value = false
    isStreaming.value = false
  }
}

// 情节回顾
async function generateRecap(forceRefresh = false) {
  if (!aiStore.isModelLoaded || !readerStore.content) return
  
  const bookUrl = readerStore.currentBook?.bookUrl
  const chapterIndex = readerStore.currentChapterIndex
  
  // 检查缓存
  if (!forceRefresh && bookUrl) {
    const cached = await getCache(bookUrl, chapterIndex, 'recap')
    if (cached) {
      recapResult.value = cached.result as string
      fromCache.value = true
      return
    }
  }
  
  isProcessing.value = true
  fromCache.value = false
  recapResult.value = ''
  
  try {
    const result = await aiStore.recapPrevious(
      readerStore.content,
      readerStore.currentChapter?.title
    )
    recapResult.value = result
    
    // 保存到缓存
    if (bookUrl && recapResult.value) {
      await setCache(bookUrl, chapterIndex, 'recap', recapResult.value)
    }
  } catch (e) {
    recapResult.value = `错误: ${e instanceof Error ? e.message : '未知错误'}`
  } finally {
    isProcessing.value = false
  }
}

// 黑话检测
async function analyzeSlang() {
  if (!aiStore.isModelLoaded || !readerStore.content) return
  
  isProcessing.value = true
  slangResult.value = []
  
  try {
    const results = await aiStore.detectSlang(readerStore.content)
    slangResult.value = results
  } catch (e) {
    showError(`检测失败: ${e instanceof Error ? e.message : '未知错误'}`)
  } finally {
    isProcessing.value = false
  }
}

// 梗典识别
async function analyzeMemes() {
  if (!aiStore.isModelLoaded || !readerStore.content) return
  
  isProcessing.value = true
  memesResult.value = []
  
  try {
    const results = await aiStore.detectMemes(readerStore.content)
    memesResult.value = results
  } catch (e) {
    showError(`识别失败: ${e instanceof Error ? e.message : '未知错误'}`)
  } finally {
    isProcessing.value = false
  }
}

// 角色图谱
async function analyzeGraph() {
  if (!aiStore.isModelLoaded || !readerStore.content) return
  
  isProcessing.value = true
  graphResult.value = { nodes: [], edges: [] }
  
  try {
    const result = await aiStore.buildCharacterGraph(readerStore.content)
    graphResult.value = result
  } catch (e) {
    showError(`构建失败: ${e instanceof Error ? e.message : '未知错误'}`)
  } finally {
    isProcessing.value = false
  }
}

// 导出分析报告
const isExporting = ref(false)
async function exportReport() {
  if (!readerStore.currentBook || !readerStore.catalog.length) {
    showError('无法导出：未找到书籍信息')
    return
  }
  
  isExporting.value = true
  try {
    const markdown = await exportAIAnalysis({
      bookName: readerStore.currentBook.name || '未知书籍',
      bookUrl: readerStore.currentBook.bookUrl || '',
      chapters: readerStore.catalog.map((ch, idx) => ({ index: idx, title: ch.title || `第${idx + 1}章` })),
    })
    downloadMarkdown(markdown, `${readerStore.currentBook.name || 'AI分析'}_分析报告.md`)
    success('导出成功')
  } catch (e) {
    showError(`导出失败: ${e instanceof Error ? e.message : '未知错误'}`)
  } finally {
    isExporting.value = false
  }
}
</script>

<template>
  <Sheet :open="open" @update:open="emit('update:open', $event)">
    <SheetContent side="right" class="w-[400px] sm:w-[450px] overflow-y-auto">
      <SheetHeader class="mb-6">
        <div class="flex items-center justify-between">
          <SheetTitle class="flex items-center gap-2.5">
            <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shadow-inner">
              <Sparkles class="h-5 w-5 text-primary" :class="{ 'animate-pulse': isProcessing }" />
            </div>
            <div class="flex flex-col">
              <span class="text-sm font-black tracking-tight">NEXUS AI</span>
              <span class="text-[10px] text-muted-foreground font-medium uppercase tracking-[0.2em]">Assistant</span>
            </div>
          </SheetTitle>
          <div class="flex items-center gap-2">
            <Button 
              v-if="aiStore.isModelLoaded"
              variant="ghost" 
              size="icon" 
              class="rounded-xl hover:bg-muted/50"
              @click="exportReport"
              :disabled="isExporting"
            >
              <Loader2 v-if="isExporting" class="h-4 w-4 animate-spin text-primary" />
              <Download v-else class="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" class="rounded-xl border-white/10 shadow-sm font-bold text-[11px]" @click="goToSettings">
              <Settings class="h-3.5 w-3.5 mr-1.5" />
              配置
            </Button>
          </div>
        </div>
      </SheetHeader>

      <!-- 动态装饰背景 -->
      <div class="absolute inset-0 pointer-events-none -z-10 bg-gradient-to-br from-primary/5 via-transparent to-blue-500/5" />

      <!-- WebGPU 不支持提示 -->
      <div v-if="!aiStore.isSupported" class="p-5 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive text-sm backdrop-blur-md">
        <p class="font-black mb-2 flex items-center gap-2">
          <X class="w-4 h-4" />
          WebGPU UNSUPPORTED
        </p>
        <p class="opacity-80 text-xs">您的硬件或浏览器不支持 WebGPU 协议。请尝试更新 Chrome 至最新版本。</p>
      </div>

      <!-- 模型未加载 -->
      <div v-else-if="!aiStore.isModelLoaded" class="py-20 text-center animate-in fade-in zoom-in-95 duration-700">
        <div class="w-20 h-20 rounded-[2.5rem] bg-muted/50 flex items-center justify-center mx-auto mb-6 shadow-premium ring-1 ring-white/10">
          <Brain class="h-10 w-10 text-muted-foreground/30" />
        </div>
        <h3 class="text-lg font-black mb-2 tracking-tight">思维模块离线</h3>
        <p class="text-xs text-muted-foreground mb-8 max-w-[200px] mx-auto leading-relaxed">
          AI 助手需要先加载本地大型语言模型才能提供智能分析
        </p>
        <Button @click="goToSettings" size="lg" class="rounded-2xl shadow-premium font-bold tracking-tight">
          <Zap class="h-4 w-4 mr-2 text-yellow-500 fill-current" />
          下载 AI 指令集
        </Button>
      </div>

      <!-- 模型已加载 - 功能面板 -->
      <div v-else class="space-y-6 animate-in fade-in duration-500">
        <!-- 模型状态仪表盘 -->
        <div class="relative overflow-hidden p-4 rounded-2xl bg-muted/30 border border-white/10 shadow-premium">
          <div 
            v-if="isProcessing" 
            class="absolute top-0 left-0 h-0.5 bg-primary animate-[shimmer_2s_infinite]" 
            :style="{ width: '100%' }"
          />
          
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-2.5">
              <div class="w-2 h-2 rounded-full shadow-[0_0_8px_rgba(34,197,94,0.6)]" :class="isProcessing ? 'bg-yellow-500' : 'bg-green-500'" />
              <span class="text-[11px] font-black uppercase tracking-widest text-foreground/80">{{ aiStore.currentModel?.split('-')[0] }}</span>
            </div>
            <span v-if="fromCache" class="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold">CACHED</span>
          </div>
          
          <!-- 性能数据 Grid -->
          <div class="grid grid-cols-2 gap-3">
            <div class="p-2 rounded-xl bg-background/40 border border-white/5">
              <p class="text-[9px] text-muted-foreground uppercase font-black tracking-tighter mb-1">推断速度</p>
              <div class="flex items-baseline gap-1">
                <span class="text-sm font-mono font-bold">{{ aiStore.performance?.tokensPerSecond || '--' }}</span>
                <span class="text-[9px] text-muted-foreground">tok/s</span>
              </div>
            </div>
            <div class="p-2 rounded-xl bg-background/40 border border-white/5">
              <p class="text-[9px] text-muted-foreground uppercase font-black tracking-tighter mb-1">响应耗时</p>
              <div class="flex items-baseline gap-1">
                <span class="text-sm font-mono font-bold">{{ aiStore.performance?.generationTime?.toFixed(2) || '--' }}</span>
                <span class="text-[9px] text-muted-foreground">sec</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 极简功能标签页 -->
        <div class="flex gap-1 p-1.5 rounded-2xl bg-muted/50 border border-white/5 flex-wrap">
          <button
            v-for="tab in ([
              { id: 'summary', icon: FileText, label: '摘要' },
              { id: 'recap', icon: History, label: '回顾' },
              { id: 'homophone', icon: Users, label: '谐音' },
              { id: 'slang', icon: BookMarked, label: '黑话' },
              { id: 'memes', icon: Drama, label: '梗典' },
              { id: 'graph', icon: Network, label: '图谱' },
              { id: 'chat', icon: MessageSquare, label: '对话' }
            ] as const)"
            :key="tab.id"
            class="flex-1 min-w-[60px] py-2 px-1 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 interactive"
            :class="activeTab === tab.id ? 'bg-background text-primary shadow-premium' : 'text-muted-foreground hover:text-foreground'"
            @click="activeTab = tab.id"
          >
            <component :is="tab.icon" class="w-3.5 h-3.5" />
            <span class="hidden sm:inline">{{ tab.label }}</span>
          </button>
        </div>

        <!-- 功能展示区 (带渐入效果) -->
        <div class="animate-in fade-in slide-in-from-bottom-2 duration-500">
          <!-- 摘要功能 -->
          <div v-if="activeTab === 'summary'" class="space-y-4">
            <Button 
              class="w-full h-12 rounded-2xl font-black shadow-premium transition-all" 
              :disabled="isProcessing"
              @click="generateSummary"
            >
              <Sparkles v-if="!isProcessing" class="w-5 h-5 mr-3" />
              <Loader2 v-else class="w-5 h-5 mr-3 animate-spin" />
              解析本章摘要
            </Button>
            
            <div v-if="summaryResult" class="relative group">
               <div class="absolute -inset-0.5 bg-gradient-to-r from-primary/20 to-blue-500/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition duration-500" />
               <div class="relative p-5 rounded-2xl bg-background border border-white/10 text-[13px] leading-relaxed shadow-premium">
                {{ summaryResult }}<span v-if="isStreaming && activeTab === 'summary'" class="inline-block w-1.5 h-4 bg-primary ml-1 animate-pulse rounded-full" />
              </div>
            </div>
          </div>

          <!-- 情节回顾 -->
          <div v-if="activeTab === 'recap'" class="space-y-4">
            <Button 
              variant="secondary"
              class="w-full h-12 rounded-2xl font-black shadow-sm"
              :disabled="isProcessing"
              @click="generateRecap"
            >
              <History v-if="!isProcessing" class="w-5 h-5 mr-3" />
              <Loader2 v-else class="w-5 h-5 mr-3 animate-spin" />
              多维剧情回溯
            </Button>
            
            <div v-if="recapResult" class="p-5 rounded-2xl bg-background border border-white/10 text-[13px] leading-relaxed whitespace-pre-wrap shadow-premium">
              {{ recapResult }}
            </div>
            
            <div v-else-if="!isProcessing" class="text-center py-12 rounded-2xl border border-dashed border-white/10">
              <p class="text-xs text-muted-foreground font-medium uppercase tracking-widest">Awaiting Command</p>
            </div>
          </div>

          <!-- 谐音识别 -->
          <div v-if="activeTab === 'homophone'" class="space-y-4">
             <Button 
              variant="outline"
              class="w-full h-12 rounded-2xl font-black border-white/10 shadow-sm"
              :disabled="isProcessing"
              @click="detectHomophones"
            >
              <RefreshCw v-if="!isProcessing" class="w-5 h-5 mr-3" />
              <Loader2 v-else class="w-5 h-5 mr-3 animate-spin" />
              透视本章隐喻
            </Button>
            
            <div v-if="homophoneResult.length > 0" class="space-y-2.5">
              <div
                v-for="(item, index) in homophoneResult"
                :key="index"
                class="p-4 rounded-2xl bg-background border border-white/5 flex items-center justify-between group hover:border-primary/30 transition-all shadow-sm interactive"
              >
                <div class="flex items-center gap-3">
                  <span class="text-[13px] font-black text-muted-foreground">{{ item.original }}</span>
                  <div class="w-4 h-px bg-white/10" />
                  <span class="text-[13px] text-primary font-black">{{ item.guess }}</span>
                </div>
                <div class="flex items-center gap-3">
                  <span class="text-[10px] font-mono text-muted-foreground/60">
                    {{ Math.round((item.confidence || 0) * 100) }}%
                  </span>
                </div>
              </div>
            </div>
            
            <div v-else-if="!isProcessing && hasAnalyzed" class="text-center py-12 bg-muted/20 border border-white/5 rounded-2xl">
               <div class="text-2xl mb-2">✦</div>
               <p class="text-xs font-bold text-muted-foreground">未检测到显著映射内容</p>
            </div>
          </div>

          <!-- 黑话检测 -->
          <div v-if="activeTab === 'slang'" class="space-y-4">
            <Button 
              variant="outline"
              class="w-full h-12 rounded-2xl font-black border-white/10 shadow-sm"
              :disabled="isProcessing"
              @click="analyzeSlang"
            >
              <BookMarked v-if="!isProcessing" class="w-5 h-5 mr-3" />
              <Loader2 v-else class="w-5 h-5 mr-3 animate-spin" />
              扫描网文黑话
            </Button>
            
            <div v-if="slangResult.length > 0" class="space-y-2.5">
              <div
                v-for="(item, index) in slangResult"
                :key="index"
                class="p-4 rounded-2xl bg-background border border-white/5 group hover:border-primary/30 transition-all shadow-sm"
              >
                <div class="flex items-center gap-2 mb-2">
                  <span class="text-[13px] font-black text-primary">{{ item.term }}</span>
                  <span class="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{{ item.category }}</span>
                  <!-- 来源标记 -->
                  <span v-if="(item as any).source === 'local'" class="text-[9px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-600">📚 内置</span>
                  <span v-else-if="(item as any).source === 'search'" class="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600">🔍 搜索</span>
                  <span v-else-if="(item as any).source === 'cache'" class="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600">⚡ 缓存</span>
                </div>
                <p class="text-xs text-muted-foreground">{{ item.meaning }}</p>
              </div>
            </div>
            
            <div v-else-if="!isProcessing" class="text-center py-12 bg-muted/20 border border-white/5 rounded-2xl">
               <div class="text-2xl mb-2">📖</div>
               <p class="text-xs font-bold text-muted-foreground">点击上方按钮扫描黑话术语</p>
            </div>
          </div>

          <!-- 梗典识别 -->
          <div v-if="activeTab === 'memes'" class="space-y-4">
            <Button 
              variant="outline"
              class="w-full h-12 rounded-2xl font-black border-white/10 shadow-sm"
              :disabled="isProcessing"
              @click="analyzeMemes"
            >
              <Drama v-if="!isProcessing" class="w-5 h-5 mr-3" />
              <Loader2 v-else class="w-5 h-5 mr-3 animate-spin" />
              识别梗与典故
            </Button>
            
            <div v-if="memesResult.length > 0" class="space-y-2.5">
              <div
                v-for="(item, index) in memesResult"
                :key="index"
                class="p-4 rounded-2xl bg-background border border-white/5 group hover:border-primary/30 transition-all shadow-sm"
              >
                <p class="text-[13px] font-black text-primary mb-1">「{{ item.reference }}」</p>
                <p class="text-xs text-muted-foreground mb-2">
                  <span class="opacity-60">出处：</span>{{ item.origin }}
                </p>
                <p class="text-xs text-foreground/80">{{ item.explanation }}</p>
              </div>
            </div>
            
            <div v-else-if="!isProcessing" class="text-center py-12 bg-muted/20 border border-white/5 rounded-2xl">
               <div class="text-2xl mb-2">🎭</div>
               <p class="text-xs font-bold text-muted-foreground">点击上方按钮识别文化梗</p>
            </div>
          </div>

          <!-- 角色图谱 -->
          <div v-if="activeTab === 'graph'" class="space-y-4">
            <Button 
              variant="outline"
              class="w-full h-12 rounded-2xl font-black border-white/10 shadow-sm"
              :disabled="isProcessing"
              @click="analyzeGraph"
            >
              <Network v-if="!isProcessing" class="w-5 h-5 mr-3" />
              <Loader2 v-else class="w-5 h-5 mr-3 animate-spin" />
              构建人物图谱
            </Button>
            
            <CharacterGraphViz 
              :graph="graphResult" 
              :loading="isProcessing && activeTab === 'graph'"
            />
          </div>

          <!-- 智能对话 -->
          <div v-if="activeTab === 'chat'" class="space-y-5">
            <!-- 对话历史 (Premium Bubble Style) -->
            <div 
              v-if="aiStore.conversationHistory.length > 0" 
              class="space-y-4 max-h-[400px] overflow-y-auto scrollbar-hide px-1"
            >
              <div
                v-for="(msg, i) in aiStore.conversationHistory"
                :key="i"
                class="flex"
                :class="msg.role === 'user' ? 'justify-end' : 'justify-start'"
              >
                <div
                  class="max-w-[85%] px-4 py-3 rounded-2xl text-[13px] leading-relaxed shadow-sm"
                  :class="msg.role === 'user'
                    ? 'bg-primary text-primary-foreground font-medium rounded-tr-none'
                    : 'bg-muted/80 backdrop-blur-md border border-white/5 rounded-tl-none'"
                >
                  {{ msg.content }}
                </div>
              </div>
            </div>
            
            <!-- 当前回复 -->
            <div v-if="chatResult && isStreaming" class="flex justify-start animate-in fade-in duration-300">
              <div class="max-w-[85%] px-4 py-3 rounded-2xl rounded-tl-none bg-muted/80 backdrop-blur-md border border-white/5 text-[13px] leading-relaxed">
                {{ chatResult }}<span class="inline-block w-1.5 h-4 bg-primary ml-1 animate-pulse rounded-full" />
              </div>
            </div>
            
            <!-- 沉浸式输入框 -->
            <div class="relative group">
              <div class="absolute -inset-1 bg-gradient-to-r from-primary/10 to-blue-500/10 rounded-2xl blur-md opacity-0 group-focus-within:opacity-100 transition" />
              <div class="relative flex gap-2 p-1 bg-muted/30 backdrop-blur-xl border border-white/10 rounded-[1.25rem]">
                <input
                  v-model="chatInput"
                  type="text"
                  placeholder="Ask Nexus anything..."
                  class="flex-1 px-4 py-2.5 bg-transparent text-[13px] focus:outline-none placeholder:text-muted-foreground/40 font-medium"
                  :disabled="isProcessing"
                  @keyup.enter="askQuestion"
                />
                <Button 
                  size="icon" 
                  class="rounded-xl w-10 h-10 shadow-premium interactive"
                  :disabled="isProcessing || !chatInput.trim()" 
                  @click="askQuestion"
                >
                  <Loader2 v-if="isProcessing" class="w-4 h-4 animate-spin" />
                  <MessageSquare v-else class="w-4 h-4 fill-current" />
                </Button>
              </div>
            </div>
            
            <!-- 工具动作 -->
            <div class="flex items-center justify-between px-1">
              <button
                v-if="aiStore.conversationHistory.length > 0"
                class="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50 hover:text-primary transition-colors flex items-center gap-2 interactive"
                @click="aiStore.clearHistory()"
              >
                <RefreshCw class="w-3 h-3" />
                Flush History
              </button>
            </div>
          </div>
        </div>
      </div>
    </SheetContent>
  </Sheet>
</template>
