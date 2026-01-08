<script setup lang="ts">
/**
 * 段落选区 AI 快捷菜单
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { Sparkles, MessageSquare, Copy, X, Users, Crown, User, Trash2 } from 'lucide-vue-next'
import { useAIStore } from '@/stores/ai'
import { useAIInsightsStore } from '@/stores/aiInsights'
import { useReaderStore } from '@/stores/reader'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast/use-toast'

const props = defineProps<{
  containerRef: HTMLElement | null
}>()

const aiStore = useAIStore()
const insightsStore = useAIInsightsStore()
const readerStore = useReaderStore()
const { toast } = useToast()

const showMenu = ref(false)
const showCharMenu = ref(false)
const menuPosition = ref({ top: 0, left: 0 })
const selectedText = ref('')
const aiResponse = ref('')
const isAnalyzing = ref(false)

function handleSelectionChange() {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || !selection.toString().trim()) {
    if (!isAnalyzing.value) {
      showMenu.value = false
      showCharMenu.value = false
    }
    return
  }

  const range = selection.getRangeAt(0)
  const rect = range.getBoundingClientRect()
  
  // 检查选区是否在阅读器容器内
  if (props.containerRef && !props.containerRef.contains(range.commonAncestorContainer)) {
    return
  }

  selectedText.value = selection.toString().trim()
  menuPosition.value = {
    top: rect.top - 55, // 向上偏移一些，避免遮挡
    left: rect.left + rect.width / 2
  }
  showMenu.value = true
}

async function askAI() {
  if (!selectedText.value || isAnalyzing.value) return
  
  isAnalyzing.value = true
  aiResponse.value = ''
  
  try {
    // 智能决策：根据选区长度决定分析策略
    const isShort = selectedText.value.length < 50
    const systemPrompt = isShort 
      ? '你是一个网文百科全书。请识别选中的短语中是否包含网络黑话、梗、谐音词或特殊术语，并提供精确解释。如果只是普通词汇，请简述含义。'
      : '你是一个忠实的阅读助理。请根据用户选中的片段内容进行简明扼要的解释、分析其在剧情中的作用，并指其涉及的关键人物。'

    await aiStore.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `选中的片段：「${selectedText.value}」` }
    ], {
      onStream: (text) => { aiResponse.value = text }
    })
  } catch (e) {
    aiResponse.value = 'AI 助手暂时无法响应。'
  } finally {
    isAnalyzing.value = false
  }
}

function copyText() {
  navigator.clipboard.writeText(selectedText.value)
  showMenu.value = false
}

async function markCharacter(role: 'protagonist' | 'supporting' | 'others' | null) {
  if (!selectedText.value || !readerStore.currentBook) return
  
  try {
    await insightsStore.markAsCharacter(
      readerStore.currentBook.bookUrl,
      selectedText.value,
      role
    )
    toast({
      title: role ? '人物标注成功' : '已移除标注',
      description: role ? `已将「${selectedText.value}」设为${role === 'protagonist' ? '主角' : '配角'}` : `已移除「${selectedText.value}」的人物标注`,
    })
    showMenu.value = false
  } catch (e) {
    toast({
      title: '标注失败',
      variant: 'destructive'
    })
  }
}

onMounted(() => {
  document.addEventListener('selectionchange', handleSelectionChange)
})

onUnmounted(() => {
  document.removeEventListener('selectionchange', handleSelectionChange)
})
</script>

<template>
  <div 
    v-if="showMenu"
    class="fixed z-[100] transition-all duration-200 pointer-events-none"
    :style="{ top: `${menuPosition.top}px`, left: `${menuPosition.left}px` }"
  >
    <div class="relative -translate-x-1/2 pointer-events-auto">
      <!-- 菜单主体 -->
      <div 
        v-if="!aiResponse && !isAnalyzing && !showCharMenu"
        class="flex items-center gap-1 p-1 rounded-full bg-background/95 backdrop-blur shadow-2xl border border-primary/20 animate-in zoom-in-95"
      >
        <Button variant="ghost" size="sm" class="rounded-full h-8 px-3 gap-1.5" @click="askAI">
          <Sparkles class="w-3.5 h-3.5 text-primary" />
          <span class="text-xs">AI 提问</span>
        </Button>
        <div class="w-px h-4 bg-border" />
        <Button variant="ghost" size="sm" class="rounded-full h-8 px-3 gap-1.5" @click="showCharMenu = true">
          <Users class="w-3.5 h-3.5 text-orange-500" />
          <span class="text-xs">记入人物志</span>
        </Button>
        <div class="w-px h-4 bg-border" />
        <Button variant="ghost" size="sm" class="rounded-full h-8 w-8 p-0" @click="copyText">
          <Copy class="w-3.5 h-3.5" />
        </Button>
      </div>

      <!-- 人物标注子菜单 -->
      <div 
        v-else-if="showCharMenu"
        class="flex items-center gap-1 p-1 rounded-full bg-background/95 backdrop-blur shadow-2xl border border-primary/20 animate-in slide-in-from-left-2"
      >
        <Button variant="ghost" size="sm" class="rounded-full h-8 px-3 gap-1.5" @click="markCharacter('protagonist')">
          <Crown class="w-3.5 h-3.5 text-yellow-500" />
          <span class="text-xs">主角</span>
        </Button>
        <Button variant="ghost" size="sm" class="rounded-full h-8 px-3 gap-1.5" @click="markCharacter('supporting')">
          <User class="w-3.5 h-3.5 text-blue-500" />
          <span class="text-xs">配角</span>
        </Button>
        <div class="w-px h-4 bg-border" />
        <Button variant="ghost" size="sm" class="rounded-full h-8 w-8 p-0 text-muted-foreground" @click="showCharMenu = false">
          <X class="w-3.5 h-3.5" />
        </Button>
      </div>

      <!-- AI 回复窗口 -->
      <div 
        v-else
        class="w-[280px] sm:w-[350px] p-4 rounded-2xl bg-background/95 backdrop-blur shadow-2xl border border-primary/20 animate-in fade-in slide-in-from-top-2"
      >
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <Sparkles class="w-4 h-4 text-primary" />
            <span class="text-xs font-bold tracking-tight">AI 片段解读</span>
          </div>
          <button @click="showMenu = false" class="text-muted-foreground hover:text-foreground">
            <X class="w-4 h-4" />
          </button>
        </div>
        
        <div class="max-h-[200px] overflow-y-auto text-sm leading-relaxed text-foreground/90">
          <div v-if="isAnalyzing && !aiResponse" class="flex items-center gap-2 text-muted-foreground italic">
            <div class="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            正在思考...
          </div>
          {{ aiResponse }}
        </div>

        <div v-if="aiResponse && !isAnalyzing" class="mt-4 pt-3 border-t border-border flex justify-end">
          <Button variant="outline" size="xs" class="h-7 text-[10px] rounded-full" @click="showMenu = false">
            完成
          </Button>
        </div>
      </div>

      <!-- 小箭头 -->
      <div 
        class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-background border-r border-b border-primary/20 rotate-45"
      />
    </div>
  </div>
</template>

<style scoped>
.animate-in {
  animation-duration: 200ms;
}
</style>
