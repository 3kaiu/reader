<script setup lang="ts">
/**
 * 阅读器模态框集合组件 [Refactored v4.0]
 * 整合所有弹窗、抽屉和面板
 */
import { X } from 'lucide-vue-next'
import ChapterList from '@/components/book/ChapterList.vue'
import ReadSettings from '@/components/ReadSettings.vue'
import BookSourcePicker from '@/components/book/BookSourcePicker.vue'
import BookInfoModal from '@/components/book/BookInfoModal.vue'
import VoiceSettings from '@/components/reader/VoiceSettings.vue'
import { defineAsyncComponent } from 'vue'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'

// 懒加载重型组件
const AIPanel = defineAsyncComponent(() => import('@/components/AIPanel.vue'))
const CharacterInsightsPanel = defineAsyncComponent(() => import('@/components/CharacterInsightsPanel.vue'))

// 本地类型定义
interface BookInfo {
  name?: string
  bookUrl?: string
}

interface ChapterInfo {
  title?: string
  index?: number
}

interface Props {
  showCatalog: boolean
  showSettings: boolean
  showSourcePicker: boolean
  showBookInfo: boolean
  showAIPanel: boolean
  showInsightsPanel: boolean
  showKeyboardHelp: boolean
  showVoiceSettings: boolean
  book?: BookInfo
  chapters?: ChapterInfo[]
  currentInd?: number
  catalogLoading?: boolean
  isCached?: (index: number) => boolean
  isDownloading?: boolean
  downloadProgress?: { current: number, total: number }
  keyboardShortcuts: Array<{ key: string, desc: string }>
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:showCatalog': [val: boolean]
  'update:showSettings': [val: boolean]
  'update:showSourcePicker': [val: boolean]
  'update:showBookInfo': [val: boolean]
  'update:showAIPanel': [val: boolean]
  'update:showInsightsPanel': [val: boolean]
  'update:showKeyboardHelp': [val: boolean]
  'update:showVoiceSettings': [val: boolean]
  'select-chapter': [index: number]
  'refresh-catalog': []
  'download-all': []
}>()
</script>

<template>
  <div>
    <!-- 目录抽屉 -->
    <ChapterList 
      v-model:open="props.showCatalog" 
      :chapters="chapters || []"
      :current-ind="currentInd || 0"
      :loading="catalogLoading"
      :book-name="book?.name"
      :is-cached="isCached"
      :is-downloading="isDownloading"
      :download-progress="downloadProgress"
      @update:open="emit('update:showCatalog', $event)"
      @select="emit('select-chapter', $event)"
      @refresh="emit('refresh-catalog')"
      @download-all="emit('download-all')"
    />
    
    <!-- 阅读设置 -->
    <ReadSettings 
      v-model:open="props.showSettings" 
      @update:open="emit('update:showSettings', $event)"
    />
    
    <!-- 换源弹窗 -->
    <BookSourcePicker 
      v-model:open="props.showSourcePicker"
      :book-url="book?.bookUrl"
      @update:open="emit('update:showSourcePicker', $event)"
    />
    
    <!-- 书籍详情 -->
    <BookInfoModal 
      v-model:open="props.showBookInfo"
      :book-url="book?.bookUrl"
      :initial-book="book"
      @update:open="emit('update:showBookInfo', $event)"
    />
    
    <!-- AI 助手面板 -->
    <AIPanel 
      v-model:open="props.showAIPanel" 
      @update:open="emit('update:showAIPanel', $event)"
    />
    
    <!-- 人物洞察面板 -->
    <CharacterInsightsPanel 
      v-model:open="props.showInsightsPanel" 
      @update:open="emit('update:showInsightsPanel', $event)"
    />

    <!-- 快捷键帮助浮层 -->
    <Transition name="fade">
      <div
        v-if="showKeyboardHelp"
        class="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
        @click="emit('update:showKeyboardHelp', false)"
      >
        <div class="bg-card rounded-2xl p-6 max-w-md w-full shadow-2xl border border-border/50" @click.stop>
          <div class="flex items-center justify-between mb-5">
            <h3 class="font-semibold text-lg flex items-center gap-2"><span>⌨️</span><span>快捷键</span></h3>
            <button @click="emit('update:showKeyboardHelp', false)" class="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center opacity-60 hover:opacity-100"><X class="w-4 h-4" /></button>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div v-for="s in keyboardShortcuts" :key="s.key" class="flex items-center gap-3">
              <kbd class="px-2 py-1 bg-muted rounded text-[10px] font-mono border">{{ s.key }}</kbd>
              <span class="text-xs opacity-70">{{ s.desc }}</span>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 语音引擎设置 (使用 Sheet 替代缺失的 Drawer) -->
    <Sheet :open="showVoiceSettings" @update:open="emit('update:showVoiceSettings', $event)">
      <SheetContent side="bottom" class="h-[80vh] rounded-t-3xl border-t-0 p-0 overflow-hidden">
        <div class="max-w-screen-md mx-auto h-full flex flex-col">
          <SheetHeader class="flex flex-row items-center justify-between px-6 py-4 shrink-0 border-b bg-background/50 backdrop-blur-md sticky top-0 z-10">
            <SheetTitle class="text-xl font-bold">语音引擎与模型</SheetTitle>
            <SheetClose as-child>
              <Button variant="ghost" size="icon" class="rounded-full"><X class="w-5 h-5" /></Button>
            </SheetClose>
          </SheetHeader>
          <div class="flex-1 overflow-y-auto">
            <VoiceSettings />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
