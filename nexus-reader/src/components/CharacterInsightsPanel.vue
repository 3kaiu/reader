<script setup lang="ts">
/**
 * 人物洞察侧边栏
 */
import { useAIInsightsStore } from '@/stores/aiInsights'
import { useReaderStore } from '@/stores/reader'
import { ref, watch } from 'vue'
import { Users, Info, Sparkles, Loader2, Crown, User } from 'lucide-vue-next'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const insightsStore = useAIInsightsStore()
const activeTab = ref<'chapter' | 'book'>('chapter')

watch(() => props.open, (val) => {
  if (val && activeTab.value === 'book') {
    const readerStore = useReaderStore()
    if (readerStore.currentBook) {
      insightsStore.loadBookInsights(readerStore.currentBook.bookUrl)
    }
  }
})

function switchTab(tab: 'chapter' | 'book') {
  activeTab.value = tab
  if (tab === 'book') {
    const readerStore = useReaderStore()
    if (readerStore.currentBook) {
      insightsStore.loadBookInsights(readerStore.currentBook.bookUrl)
    }
  }
}
</script>

<template>
  <Sheet :open="open" @update:open="emit('update:open', $event)">
    <SheetContent side="right" class="w-[380px] sm:w-[500px] overflow-hidden border-l border-primary/10 shadow-2xl bg-background/95 backdrop-blur-3xl p-0 flex flex-col">
      <SheetHeader class="px-6 pt-6 pb-2 shrink-0">
        <SheetTitle class="flex items-center gap-2 mb-4">
          <Users class="h-5 w-5" />
          阅读洞察
        </SheetTitle>
        
        <!-- Tabs -->
        <div class="flex p-1 bg-muted/30 rounded-xl mb-2">
          <button 
            class="flex-1 py-2 text-xs font-bold rounded-lg transition-all"
            :class="activeTab === 'chapter' ? 'bg-background shadow-sm text-primary' : 'text-muted-foreground'"
            @click="switchTab('chapter')"
          >
            本章分析
          </button>
          <button 
            class="flex-1 py-2 text-xs font-bold rounded-lg transition-all"
            :class="activeTab === 'book' ? 'bg-background shadow-sm text-primary' : 'text-muted-foreground'"
            @click="switchTab('book')"
          >
            人物志 (全书)
          </button>
        </div>
      </SheetHeader>

      <div class="flex-1 overflow-y-auto px-6 pb-6">
        <!-- 本章视图 -->
        <div v-if="activeTab === 'chapter'">
          <div v-if="insightsStore.isAnalyzing" class="space-y-6 mt-4">
            <div class="p-3 rounded-xl bg-muted/40 animate-pulse border border-transparent" />
            <div v-for="i in 3" :key="i" class="p-4 rounded-2xl bg-muted/20 border border-transparent space-y-3">
              <div class="h-5 w-24 bg-muted/60 rounded-md animate-pulse" />
              <div class="h-4 w-full bg-muted/40 rounded-md animate-pulse" />
            </div>
            <div class="py-4 text-center">
              <Loader2 class="h-5 w-5 animate-spin mx-auto mb-2 text-primary/40" />
              <p class="text-[11px] font-medium text-muted-foreground uppercase tracking-widest">AI 深度洞察中</p>
            </div>
          </div>

          <TransitionGroup 
            v-else-if="insightsStore.currentInsight?.characters.length" 
            name="list-cascade"
            tag="div"
            class="space-y-6 mt-4"
          >
            <!-- 情绪氛围 -->
            <div key="mood-badge" v-if="insightsStore.currentInsight.mood" class="p-4 rounded-2xl bg-primary/[0.03] border border-primary/10 flex items-center justify-between shadow-sm">
              <div class="flex flex-col">
                <span class="text-[10px] font-bold text-primary/50 uppercase tracking-widest mb-0.5">Atmosphere</span>
                <span class="text-sm font-semibold">{{ insightsStore.currentInsight.mood }}</span>
              </div>
              <Sparkles class="h-4 w-4 text-primary/60" />
            </div>

            <div 
              v-for="(char, idx) in insightsStore.currentInsight.characters" 
              :key="char.name"
              class="p-5 rounded-2xl bg-card border border-transparent shadow-sm hover:shadow-md hover:border-primary/10 transition-all group"
            >
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2">
                  <div class="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                    <Crown v-if="char.role === 'protagonist'" class="w-4 h-4 text-yellow-500" />
                    <span v-else>{{ char.name.charAt(0) }}</span>
                  </div>
                  <h4 class="font-bold text-base tracking-tight flex items-center gap-1.5">
                    {{ char.name }}
                    <Badge v-if="char.role === 'protagonist'" variant="secondary" class="text-[9px] bg-yellow-500/10 text-yellow-600 border-yellow-200">主角</Badge>
                  </h4>
                </div>
              </div>
              <p class="text-[13px] text-muted-foreground/90 mb-4 leading-relaxed">{{ char.description }}</p>
              
              <!-- 关系 -->
              <div v-if="char.ties.length" class="space-y-2 pt-3 border-t border-primary/5">
                <div v-for="tie in char.ties" :key="tie.to" class="flex items-baseline gap-2">
                  <span class="text-[9px] font-black text-primary/40 uppercase tracking-tighter">{{ tie.relation }}</span>
                  <span class="text-xs font-bold">{{ tie.to }}</span>
                </div>
              </div>
            </div>
          </TransitionGroup>

          <div v-else class="py-12 text-center text-muted-foreground">
            <Info class="h-8 w-8 opacity-20 mx-auto mb-4" />
            <p class="text-sm">暂无本章分析数据</p>
          </div>
        </div>

        <!-- 全书视图 -->
        <div v-else class="mt-4 space-y-6">
          <div v-if="insightsStore.allCharacters.length === 0" class="py-12 text-center text-muted-foreground">
            <Users class="h-8 w-8 opacity-20 mx-auto mb-4" />
            <p class="text-sm">尚未发现任何人物信息</p>
            <p class="text-[11px] opacity-60 mt-2">点击 AI 面板分析章节可自动收录人物</p>
          </div>

          <div 
            v-for="char in insightsStore.allCharacters" 
            :key="char.name"
            class="p-5 rounded-2xl bg-card border border-primary/5 shadow-sm"
          >
            <div class="flex items-center justify-between mb-3">
              <div class="flex items-center gap-2">
                <div class="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm"
                  :class="char.role === 'protagonist' ? 'bg-yellow-500/10 text-yellow-600' : 'bg-secondary/10 text-secondary-foreground'"
                >
                  <Crown v-if="char.role === 'protagonist'" class="w-4 h-4" />
                  <span v-else>{{ char.name.charAt(0) }}</span>
                </div>
                <h4 class="font-bold text-base tracking-tight flex items-center gap-2">
                  {{ char.name }}
                  <Badge v-if="char.role === 'protagonist'" class="text-[9px] h-4 bg-yellow-500/10 text-yellow-600 border-none">主角</Badge>
                  <Badge v-else-if="char.role === 'supporting'" class="text-[9px] h-4 bg-blue-500/10 text-blue-600 border-none">配角</Badge>
                </h4>
              </div>
              <div class="flex items-center gap-2">
                <Badge v-if="char.isManual" variant="outline" class="text-[8px] h-3.5 px-1 opacity-50 border-primary/20">手动</Badge>
                <Badge variant="secondary" class="text-[9px] h-4">出现 {{ char.appearances }} 次</Badge>
              </div>
            </div>
            <p class="text-[13px] text-muted-foreground/90 leading-relaxed">{{ char.description }}</p>
          </div>
        </div>
      </div>
    </SheetContent>
  </Sheet>
</template>

<style scoped>
.list-cascade-enter-active, .list-cascade-leave-active { transition: all 0.4s ease; }
.list-cascade-enter-from, .list-cascade-leave-to { opacity: 0; transform: translateX(10px); }
.group:hover { transform: translateY(-1px); }
</style>
