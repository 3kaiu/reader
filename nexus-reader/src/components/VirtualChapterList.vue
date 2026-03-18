<template>
  <div class="virtual-chapter-list">
    <VirtualScroller
      ref="scrollerRef"
      :items="chapters"
      :item-height="getChapterHeight"
      :container-height="containerHeight"
      :overscan="5"
      :show-performance-info="showDebugInfo"
      :key-field="'id'"
      @visible-range-change="handleVisibleRangeChange"
      @scroll="handleScroll"
    >
      <template #default="{ item: chapter, index }">
        <div 
          class="chapter-item" 
          :class="{ 
            'chapter-active': chapter.id === activeChapterId,
            'chapter-read': chapter.isRead,
            'chapter-downloading': chapter.isDownloading,
            'chapter-cached': chapter.isCached
          }"
          @click="handleChapterClick(chapter, index)"
          @contextmenu="handleChapterContextMenu($event, chapter)"
        >
          <!-- 章节状态指示器 -->
          <div class="chapter-status">
            <div v-if="chapter.isDownloading" class="status-icon downloading">
              <div class="spinner"></div>
            </div>
            <div v-else-if="chapter.isCached" class="status-icon cached">📱</div>
            <div v-else-if="chapter.isRead" class="status-icon read">✓</div>
            <div v-else class="status-icon unread">○</div>
          </div>

          <!-- 章节信息 -->
          <div class="chapter-info">
            <div class="chapter-title">{{ chapter.title }}</div>
            <div class="chapter-meta">
              <span class="chapter-number">第{{ chapter.number }}章</span>
              <span v-if="chapter.wordCount" class="chapter-words">{{ formatWordCount(chapter.wordCount) }}</span>
              <span v-if="chapter.publishTime" class="chapter-time">{{ formatTime(chapter.publishTime) }}</span>
            </div>
            <div v-if="chapter.summary" class="chapter-summary">{{ chapter.summary }}</div>
          </div>

          <!-- 章节操作 -->
          <div class="chapter-actions">
            <button 
              v-if="!chapter.isCached" 
              @click.stop="handleDownload(chapter)"
              class="action-btn download-btn"
              :disabled="chapter.isDownloading"
            >
              {{ chapter.isDownloading ? '下载中...' : '缓存' }}
            </button>
            <button 
              v-if="chapter.isCached" 
              @click.stop="handleRemoveCache(chapter)"
              class="action-btn remove-btn"
            >
              移除缓存
            </button>
          </div>

          <!-- 阅读进度条 -->
          <div v-if="chapter.readProgress > 0" class="chapter-progress">
            <div class="progress-bar">
              <div 
                class="progress-fill" 
                :style="{ width: `${chapter.readProgress}%` }"
              ></div>
            </div>
            <span class="progress-text">{{ Math.round(chapter.readProgress) }}%</span>
          </div>
        </div>
      </template>
    </VirtualScroller>

    <!-- 快速跳转工具栏 -->
    <div v-if="showQuickJump" class="quick-jump-toolbar">
      <button @click="scrollToTop" class="jump-btn">顶部</button>
      <button @click="scrollToActive" class="jump-btn">当前</button>
      <button @click="scrollToBottom" class="jump-btn">底部</button>
      <button @click="toggleDebugInfo" class="jump-btn">调试</button>
    </div>

    <!-- 章节搜索 -->
    <div v-if="showSearch" class="chapter-search">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="搜索章节..."
        class="search-input"
        @input="handleSearch"
      />
      <div v-if="searchResults.length > 0" class="search-results">
        <div
          v-for="result in searchResults"
          :key="result.id"
          class="search-result"
          @click="scrollToChapter(result.index)"
        >
          <span class="result-title">{{ result.title }}</span>
          <span class="result-number">第{{ result.number }}章</span>
        </div>
      </div>
    </div>

    <!-- 批量操作工具栏 -->
    <div v-if="selectedChapters.size > 0" class="batch-toolbar">
      <div class="batch-info">已选择 {{ selectedChapters.size }} 章</div>
      <button @click="batchDownload" class="batch-btn">批量缓存</button>
      <button @click="batchMarkRead" class="batch-btn">标记已读</button>
      <button @click="clearSelection" class="batch-btn">取消选择</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import VirtualScroller from './VirtualScroller.vue'
import { batchRequestManager } from '../utils/batchRequestManager'
import { offlineService } from '../services/offline/service'

interface Chapter {
  id: string
  number: number
  title: string
  summary?: string
  wordCount?: number
  publishTime?: string
  isRead: boolean
  readProgress: number
  isCached: boolean
  isDownloading: boolean
  url: string
}

interface Props {
  chapters: Chapter[]
  activeChapterId?: string
  containerHeight?: number
  showQuickJump?: boolean
  showSearch?: boolean
  enableBatchSelect?: boolean
  chapterHeight?: number
}

const props = withDefaults(defineProps<Props>(), {
  containerHeight: 600,
  showQuickJump: true,
  showSearch: false,
  enableBatchSelect: false,
  chapterHeight: 80
})

const emit = defineEmits<{
  chapterClick: [chapter: Chapter, index: number]
  chapterContextMenu: [event: MouseEvent, chapter: Chapter]
  download: [chapter: Chapter]
  removeCache: [chapter: Chapter]
  batchDownload: [chapters: Chapter[]]
  batchMarkRead: [chapters: Chapter[]]
  visibleRangeChange: [range: { start: number; end: number }]
}>()

// 响应式状态
const scrollerRef = ref<InstanceType<typeof VirtualScroller>>()
const searchQuery = ref('')
const searchResults = ref<Array<Chapter & { index: number }>>([])
const selectedChapters = ref<Set<string>>(new Set())
const showDebugInfo = ref(false)
const visibleRange = ref({ start: 0, end: 0 })

// 计算属性
const filteredChapters = computed(() => {
  if (!searchQuery.value) return props.chapters
  
  const query = searchQuery.value.toLowerCase()
  return props.chapters.filter(chapter => 
    chapter.title.toLowerCase().includes(query) ||
    chapter.number.toString().includes(query)
  )
})

// 方法
const getChapterHeight = (chapter: Chapter, index: number): number => {
  let height = props.chapterHeight
  
  // 根据内容调整高度
  if (chapter.summary) {
    height += 20 // 摘要行高度
  }
  
  if (chapter.readProgress > 0) {
    height += 15 // 进度条高度
  }
  
  return height
}

const handleChapterClick = (chapter: Chapter, index: number) => {
  if (props.enableBatchSelect && (event as MouseEvent).ctrlKey) {
    toggleChapterSelection(chapter.id)
  } else {
    emit('chapterClick', chapter, index)
  }
}

const handleChapterContextMenu = (event: MouseEvent, chapter: Chapter) => {
  event.preventDefault()
  emit('chapterContextMenu', event, chapter)
}

const handleDownload = async (chapter: Chapter) => {
  try {
    // 设置下载状态
    chapter.isDownloading = true
    
    // 缓存章节内容
    await offlineService.cacheContentForOffline(chapter.id, 'chapter', 8)
    
    // 更新状态
    chapter.isCached = true
    chapter.isDownloading = false
    
    emit('download', chapter)
  } catch (error: any) {
    console.error('Chapter download failed:', error)
    chapter.isDownloading = false
  }
}

const handleRemoveCache = async (chapter: Chapter) => {
  try {
    // 这里应该调用实际的缓存移除API
    chapter.isCached = false
    emit('removeCache', chapter)
  } catch (error: any) {
    console.error('Remove cache failed:', error)
  }
}

const handleSearch = () => {
  if (!searchQuery.value) {
    searchResults.value = []
    return
  }

  const query = searchQuery.value.toLowerCase()
  const results: Array<Chapter & { index: number }> = []
  
  props.chapters.forEach((chapter, index) => {
    if (chapter.title.toLowerCase().includes(query) || 
        chapter.number.toString().includes(query)) {
      results.push({ ...chapter, index })
    }
  })
  
  searchResults.value = results.slice(0, 10) // 限制搜索结果数量
}

const handleVisibleRangeChange = (range: { start: number; end: number }) => {
  visibleRange.value = range
  emit('visibleRangeChange', range)
  
  // 预加载可见范围附近的章节
  preloadNearbyChapters(range)
}

const handleScroll = (scrollInfo: { scrollTop: number; scrollLeft: number }) => {
  // 可以在这里添加滚动相关的逻辑
}

const scrollToTop = () => {
  scrollerRef.value?.scrollToTop()
}

const scrollToBottom = () => {
  scrollerRef.value?.scrollToBottom()
}

const scrollToActive = () => {
  if (props.activeChapterId) {
    const index = props.chapters.findIndex(ch => ch.id === props.activeChapterId)
    if (index >= 0) {
      scrollerRef.value?.scrollToIndex(index)
    }
  }
}

const scrollToChapter = (index: number) => {
  scrollerRef.value?.scrollToIndex(index)
  searchResults.value = []
  searchQuery.value = ''
}

const toggleChapterSelection = (chapterId: string) => {
  if (selectedChapters.value.has(chapterId)) {
    selectedChapters.value.delete(chapterId)
  } else {
    selectedChapters.value.add(chapterId)
  }
}

const clearSelection = () => {
  selectedChapters.value.clear()
}

const batchDownload = async () => {
  const chaptersToDownload = props.chapters.filter(ch => 
    selectedChapters.value.has(ch.id) && !ch.isCached
  )
  
  if (chaptersToDownload.length === 0) return
  
  try {
    // 使用批量请求管理器下载
    const chapterIds = chaptersToDownload.map(ch => ch.id)
    await batchRequestManager.batchGetChapters(chapterIds)
    
    // 更新状态
    chaptersToDownload.forEach(chapter => {
      chapter.isCached = true
    })
    
    emit('batchDownload', chaptersToDownload)
    clearSelection()
  } catch (error: any) {
    console.error('Batch download failed:', error)
  }
}

const batchMarkRead = () => {
  const chaptersToMark = props.chapters.filter(ch => 
    selectedChapters.value.has(ch.id)
  )
  
  chaptersToMark.forEach(chapter => {
    chapter.isRead = true
    chapter.readProgress = 100
  })
  
  emit('batchMarkRead', chaptersToMark)
  clearSelection()
}

const toggleDebugInfo = () => {
  showDebugInfo.value = !showDebugInfo.value
}

const preloadNearbyChapters = async (range: { start: number; end: number }) => {
  // 预加载可见范围前后的章节
  const preloadStart = Math.max(0, range.start - 2)
  const preloadEnd = Math.min(props.chapters.length - 1, range.end + 2)
  
  const chaptersToPreload = []
  for (let i = preloadStart; i <= preloadEnd; i++) {
    const chapter = props.chapters[i]
    if (!chapter.isCached && !chapter.isDownloading) {
      chaptersToPreload.push({
        contentId: chapter.id,
        type: 'chapter' as const,
        priority: 3
      })
    }
  }
  
  if (chaptersToPreload.length > 0) {
    try {
      await offlineService.batchCacheContent(chaptersToPreload)
    } catch (error: any) {
      console.warn('Preload failed:', error)
    }
  }
}

const formatWordCount = (count: number): string => {
  if (count < 1000) return `${count}字`
  if (count < 10000) return `${(count / 1000).toFixed(1)}k字`
  return `${(count / 10000).toFixed(1)}万字`
}

const formatTime = (time: string): string => {
  const date = new Date(time)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  
  if (diff < 24 * 60 * 60 * 1000) {
    return '今天'
  } else if (diff < 7 * 24 * 60 * 60 * 1000) {
    return `${Math.floor(diff / (24 * 60 * 60 * 1000))}天前`
  } else {
    return date.toLocaleDateString()
  }
}

// 监听活跃章节变化，自动滚动到位置
watch(() => props.activeChapterId, (newId) => {
  if (newId) {
    nextTick(() => {
      scrollToActive()
    })
  }
})
</script>

<style scoped>
.virtual-chapter-list {
  position: relative;
  height: 100%;
}

.chapter-item {
  display: flex;
  align-items: flex-start;
  padding: 12px 16px;
  border-bottom: 1px solid #e0e0e0;
  cursor: pointer;
  transition: all 0.2s ease;
  background: white;
}

.chapter-item:hover {
  background: #f5f5f5;
  transform: translateX(2px);
}

.chapter-item.chapter-active {
  background: #e3f2fd;
  border-left: 4px solid #2196f3;
}

.chapter-item.chapter-read {
  opacity: 0.7;
}

.chapter-item.chapter-downloading {
  background: #fff3e0;
}

.chapter-item.chapter-cached {
  background: #e8f5e8;
}

.chapter-status {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  margin-right: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.status-icon {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}

.status-icon.downloading {
  background: #ff9800;
  color: white;
}

.status-icon.cached {
  background: #4caf50;
  color: white;
}

.status-icon.read {
  background: #2196f3;
  color: white;
}

.status-icon.unread {
  border: 2px solid #ccc;
  color: #ccc;
}

.spinner {
  width: 12px;
  height: 12px;
  border: 2px solid transparent;
  border-top: 2px solid white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.chapter-info {
  flex: 1;
  min-width: 0;
}

.chapter-title {
  font-size: 16px;
  font-weight: 500;
  color: #333;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chapter-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: #666;
  margin-bottom: 4px;
}

.chapter-summary {
  font-size: 13px;
  color: #888;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chapter-actions {
  flex-shrink: 0;
  display: flex;
  gap: 8px;
  margin-left: 12px;
}

.action-btn {
  padding: 4px 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: white;
  color: #666;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.action-btn:hover {
  background: #f5f5f5;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.download-btn {
  border-color: #4caf50;
  color: #4caf50;
}

.download-btn:hover {
  background: #4caf50;
  color: white;
}

.remove-btn {
  border-color: #f44336;
  color: #f44336;
}

.remove-btn:hover {
  background: #f44336;
  color: white;
}

.chapter-progress {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: #f0f0f0;
}

.progress-bar {
  width: 100%;
  height: 100%;
  background: #e0e0e0;
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #4caf50, #8bc34a);
  transition: width 0.3s ease;
}

.progress-text {
  position: absolute;
  right: 8px;
  bottom: 4px;
  font-size: 10px;
  color: #666;
  background: rgba(255, 255, 255, 0.8);
  padding: 1px 4px;
  border-radius: 2px;
}

.quick-jump-toolbar {
  position: absolute;
  bottom: 16px;
  right: 16px;
  display: flex;
  gap: 8px;
  background: rgba(0, 0, 0, 0.8);
  padding: 8px;
  border-radius: 8px;
  backdrop-filter: blur(10px);
}

.jump-btn {
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.2);
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.2s ease;
}

.jump-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}

.chapter-search {
  position: absolute;
  top: 16px;
  left: 16px;
  right: 16px;
  z-index: 100;
}

.search-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  background: white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.search-results {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: white;
  border: 1px solid #ddd;
  border-top: none;
  border-radius: 0 0 4px 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  max-height: 200px;
  overflow-y: auto;
}

.search-result {
  padding: 8px 12px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.search-result:hover {
  background: #f5f5f5;
}

.result-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-number {
  font-size: 12px;
  color: #666;
}

.batch-toolbar {
  position: absolute;
  bottom: 16px;
  left: 16px;
  right: 16px;
  background: rgba(0, 0, 0, 0.9);
  color: white;
  padding: 12px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 12px;
  backdrop-filter: blur(10px);
}

.batch-info {
  flex: 1;
  font-size: 14px;
}

.batch-btn {
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.2);
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.2s ease;
}

.batch-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}

/* 响应式 */
@media (max-width: 768px) {
  .chapter-item {
    padding: 10px 12px;
  }
  
  .chapter-title {
    font-size: 15px;
  }
  
  .chapter-meta {
    font-size: 11px;
  }
  
  .chapter-actions {
    margin-left: 8px;
  }
  
  .action-btn {
    padding: 3px 6px;
    font-size: 11px;
  }
  
  .quick-jump-toolbar {
    bottom: 12px;
    right: 12px;
    padding: 6px;
  }
  
  .jump-btn {
    padding: 4px 8px;
    font-size: 11px;
  }
}

/* 暗色主题 */
@media (prefers-color-scheme: dark) {
  .chapter-item {
    background: #1e1e1e;
    border-bottom-color: #333;
  }
  
  .chapter-item:hover {
    background: #2a2a2a;
  }
  
  .chapter-item.chapter-active {
    background: #1a237e;
  }
  
  .chapter-title {
    color: #e0e0e0;
  }
  
  .chapter-meta {
    color: #999;
  }
  
  .chapter-summary {
    color: #777;
  }
  
  .action-btn {
    background: #333;
    border-color: #555;
    color: #ccc;
  }
  
  .action-btn:hover {
    background: #444;
  }
  
  .search-input {
    background: #333;
    border-color: #555;
    color: #e0e0e0;
  }
  
  .search-results {
    background: #333;
    border-color: #555;
  }
  
  .search-result:hover {
    background: #444;
  }
}
</style>