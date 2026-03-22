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
import type { Book, Chapter } from '@/types/book'

interface Props {
  showCatalog: boolean
  showSettings: boolean
  showSourcePicker: boolean
  showBookInfo: boolean
  showKeyboardHelp: boolean
  book?: Book | null
  chapters?: Chapter[]
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
  'update:showKeyboardHelp': [val: boolean]
  'select-chapter': [index: number]
  'refresh': []
  'download-all': []
}>()
</script>

<template>
  <div>
    <!-- 目录抽屉 -->
    <ChapterList 
      v-model:open="props.showCatalog" 
      :chapters="chapters || []"
      :current-ind="currentInd ?? -1"
      :loading="catalogLoading"
      :book-name="book?.name"
      :is-cached="isCached"
      :is-downloading="isDownloading"
      :download-progress="downloadProgress"
      @update:open="emit('update:showCatalog', $event)"
      @select="emit('select-chapter', $event)"
      @refresh="emit('refresh')"
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
      @update:open="emit('update:showSourcePicker', $event)"
    />
    
    <!-- 书籍详情 -->
    <BookInfoModal 
      v-model:open="props.showBookInfo"
      :book-url="book?.bookUrl"
      :initial-book="book"
      @update:open="emit('update:showBookInfo', $event)"
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
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
