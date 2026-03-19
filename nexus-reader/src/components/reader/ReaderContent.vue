<script setup lang="ts">
/**
 * 阅读器主内容区组件
 * 支持无限滚动模式和左右翻页模式
 */
import { ref } from 'vue'
import { Loader2 } from 'lucide-vue-next'

// 本地类型定义
interface LoadedChapter {
  index: number
  title: string
  formattedContent?: string
}

interface SwipeLayout {
  columnWidth: number
  columnGap: number
  padding: number
}

type ContentStyle = Record<string, string | number>

// 解密实体类型
interface DecodedEntity {
  id: string
  original: string
  position: { start: number; end: number }
  bestMatch: { real: string; confidence: number; category: string } | null
}

interface Props {
  readingMode: 'scroll' | 'swipe'
  contentStyle: ContentStyle
  loadedChapters: LoadedChapter[]
  isParsing: boolean
  isLoadingMore: boolean
  hasNextChapter: boolean
  formattedContent: string // 预格式化后的单章内容
  currentChapter: LoadedChapter | null // 当前章节 (用于 swipe 模式)
  currentChapterIndex: number
  totalChapters: number
  // Swipe 模式专用
  swipePage: number
  swipeTotalPages: number
  swipeLayout: SwipeLayout
  pageTransition: string
  // 其他
  showToolbar: boolean
  isFullscreen: boolean
  formattedTime: string
  paragraphSpacing: number
  // 新增：加载失败状态
  loadError?: string | null
  // 解密相关
  decoderEnabled?: boolean
  decoderEntities?: DecodedEntity[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  click: []
  loadNextChapter: []
  retryLoad: [] // 新增：重试加载事件
  entityClick: [entity: DecodedEntity, event: MouseEvent] // 解密实体点击
}>()

const swipeContentRef = ref<HTMLElement | null>(null)

/** 处理解密高亮的内容 */
function applyDecoderHighlight(html: string, entities: DecodedEntity[]): string {
  if (!entities || entities.length === 0) return html
  
  // 提取纯文本用于位置匹配
  const tempDiv = document.createElement('div')
  tempDiv.innerHTML = html
  const plainText = tempDiv.textContent || ''
  
  // 过滤有效实体并按位置排序
  const validEntities = entities
    .filter((e) => e.bestMatch !== null)
    .sort((a, b) => b.position.start - a.position.start) // 从后往前替换
  
  // 在 HTML 中查找并替换
  let result = html
  for (const entity of validEntities) {
    const original = entity.original
    const confidence = entity.bestMatch!.confidence
    const colorClass = confidence >= 80 ? 'decoder-high' : confidence >= 50 ? 'decoder-medium' : 'decoder-low'
    
    // 使用正则替换，避免替换 HTML 标签内的内容
    const regex = new RegExp(`(?<![<\\w])${escapeRegex(original)}(?![\\w>])`, 'g')
    result = result.replace(regex, (match) => {
      return `<span class="decoder-entity ${colorClass}" data-entity-id="${entity.id}" title="${entity.bestMatch!.real} (${confidence}%)">${match}</span>`
    })
  }
  
  return result
}

/** 转义正则特殊字符 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 处理实体点击 (通过事件委托) */
function handleContentClick(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (target.classList.contains('decoder-entity')) {
    const entityId = target.dataset.entityId
    if (entityId && props.decoderEntities) {
      const entity = props.decoderEntities.find(e => e.id === entityId)
      if (entity) {
        emit('entityClick', entity, event)
      }
    }
  }
}

/** 获取带高亮的章节内容 */
function getHighlightedContent(content: string | undefined): string {
  if (!content) return ''
  if (!props.decoderEnabled || !props.decoderEntities?.length) return content
  return applyDecoderHighlight(content, props.decoderEntities)
}

// 暴露给父组件，供 useSwipeMode 使用
defineExpose({
  swipeContentRef
})
</script>

<template>
  <div class="reader-container">
    <!-- 正文 (无限滚动模式) -->
    <div 
      v-if="readingMode === 'scroll'"
      class="mx-auto px-6 pb-40 pt-20" 
      :style="{ ...contentStyle, '--p-spacing': `${paragraphSpacing}em`, '--p-line-height': contentStyle.lineHeight }"
    >
      <!-- 多章节内容 -->
      <template v-for="chapter in loadedChapters" :key="chapter.index">
        <!-- 章节标题 -->
        <div 
          class="chapter-marker text-center py-10 mt-10 first:mt-0"
          :data-chapter-index="chapter.index"
        >
          <div class="inline-block px-6 py-2 bg-primary/5 rounded-full mb-4">
            <span class="text-xs opacity-60">第 {{ chapter.index + 1 }} 章</span>
          </div>
          <h2 class="chapter-title text-xl font-bold opacity-90">
            {{ chapter.title }}
          </h2>
        </div>
        
        <!-- 章节内容 -->
        <article class="reader-text" @click="handleContentClick">
          <div v-if="chapter.formattedContent" v-html="getHighlightedContent(chapter.formattedContent)" />
          <div v-else class="py-10 text-center opacity-40">
            <Loader2 class="w-6 h-6 animate-spin mx-auto mb-2" />
            <p class="text-xs">正在解析内容...</p>
          </div>
        </article>
      </template>
      
      <!-- 解析中指示器 (初次加载) -->
      <div v-if="isParsing && loadedChapters.length === 0" class="py-20 text-center">
        <Loader2 class="w-8 h-8 animate-spin mx-auto opacity-40" />
        <p class="text-sm opacity-40 mt-3">正在解析章节...</p>
      </div>

      <!-- 加载更多指示器 -->
      <div v-if="isLoadingMore" class="py-12 text-center">
        <Loader2 class="w-8 h-8 animate-spin mx-auto opacity-40" />
        <p class="text-sm opacity-40 mt-3">正在加载下一章...</p>
      </div>
      
      <!-- 已加载到末尾 -->
      <div v-else-if="!hasNextChapter && loadedChapters.length > 0" class="py-16 text-center">
        <div class="inline-block px-8 py-3 bg-current/5 rounded-full">
          <p class="text-sm opacity-60">🎉 恭喜，已读完全书 🎉</p>
        </div>
      </div>
      
      <!-- 加载下一章按钮 -->
      <div v-else-if="loadedChapters.length > 0" class="py-12 text-center">
        <!-- 正常加载状态 -->
        <div v-if="!loadError">
          <button 
            class="px-6 py-3 bg-current/10 hover:bg-current/15 rounded-full text-sm font-medium transition-colors"
            @click.stop="emit('loadNextChapter')"
          >
            加载下一章
          </button>
          <p class="text-xs opacity-30 mt-3">或继续滚动自动加载</p>
        </div>
        
        <!-- 加载失败状态 -->
        <div v-else class="space-y-3">
          <div class="px-4 py-2 bg-red-500/10 rounded-lg text-red-600 dark:text-red-400">
            <p class="text-sm">⚠️ 自动加载失败</p>
            <p class="text-xs opacity-70 mt-1">{{ loadError }}</p>
          </div>
          <div class="flex gap-3 justify-center">
            <button 
              class="px-4 py-2 bg-current/10 hover:bg-current/15 rounded-full text-sm font-medium transition-colors"
              @click.stop="emit('retryLoad')"
            >
              🔄 重试
            </button>
            <button 
              class="px-4 py-2 bg-current/10 hover:bg-current/15 rounded-full text-sm font-medium transition-colors"
              @click.stop="emit('loadNextChapter')"
            >
              手动加载
            </button>
          </div>
          <p class="text-xs opacity-30">网络问题可能导致加载失败</p>
        </div>
      </div>
    </div>
    
    <!-- 正文 (左右翻页模式) -->
    <div 
      v-else
      class="fixed inset-0 z-0 overflow-hidden"
      :style="{
        ...contentStyle,
        '--p-spacing': `${paragraphSpacing}em`,
        '--p-line-height': contentStyle.lineHeight,
        maxWidth: 'none',
        height: '100vh',
        width: '100vw'
      }"
    >
      <!-- 高性能 GPU SDF 渲染占位 (通过 SharedArrayBuffer 异步绘制) -->

      <div 
        ref="swipeContentRef"
        class="h-full w-full py-8 transition-opacity duration-300"
        :class="{ 'opacity-0': isParsing }"
        :style="{
          columnWidth: `${swipeLayout.columnWidth}px`,
          columnGap: `${swipeLayout.columnGap}px`,
          paddingLeft: `${swipeLayout.padding}px`,
          paddingRight: `${swipeLayout.padding}px`,
          height: '100vh',
          transform: pageTransition !== 'fade' 
            ? `translateX(-${swipePage * 100}vw)` 
            : 'none',
          opacity: pageTransition === 'fade' ? 1 : undefined,
          transition: pageTransition
        }"
      >
        <!-- 章节标题 -->
        <div class="text-center pb-8 pt-4">
           <div class="inline-block px-4 py-1 bg-primary/5 rounded-full mb-2">
             <span class="text-xs opacity-60">第 {{ currentChapterIndex + 1 }} 章</span>
           </div>
           <h2 class="chapter-title text-xl font-bold opacity-90 mb-0">
             {{ currentChapter?.title }}
           </h2>
        </div>
        
        <!-- 章节内容 -->
        <article class="reader-text text-justify" @click="handleContentClick">
          <div v-if="isParsing" class="h-60 flex flex-col items-center justify-center opacity-40">
            <Loader2 class="w-8 h-8 animate-spin mb-4" />
            <p class="text-sm">内容解析中...</p>
          </div>
          <div v-else v-html="getHighlightedContent(formattedContent)" />
        </article>
        
        <!-- 本章结束提示 -->
        <div class="h-40 flex flex-col items-center justify-center text-center opacity-60 break-inside-avoid">
           <div class="divider mb-2">❦</div>
           <p class="text-xs">本章完</p>
        </div>
      </div>
      
      <!-- 页码指示器 -->
      <div 
        class="fixed bottom-3 right-6 text-xs opacity-40 font-mono pointer-events-none z-10 transition-opacity duration-300" 
        :class="{ 'opacity-0': showToolbar }"
      >
        {{ swipePage + 1 }} / {{ swipeTotalPages }}
      </div>
    </div>

    <!-- 全屏时钟 -->
    <div v-if="isFullscreen" class="fixed top-4 right-6 text-xs opacity-30 font-mono pointer-events-none z-50">
      {{ formattedTime }}
    </div>
  </div>
</template>

<style scoped>
.reader-container {
  min-height: 100vh;
  cursor: text;
}

.reader-text :deep(.content-paragraph) {
  text-indent: 2em;
  word-break: break-word;
  letter-spacing: 0.02em;
  text-align: justify;
  line-height: var(--p-line-height, 1.8);
  margin-bottom: var(--p-spacing, 1.2em);
}

.chapter-title {
  position: relative;
  padding-bottom: 1rem;
}

.chapter-title::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 60px;
  height: 2px;
  background: linear-gradient(90deg, transparent, currentColor, transparent);
  opacity: 0.3;
}

.divider {
  font-family: serif;
  font-size: 1.5rem;
  opacity: 0.5;
}

.break-inside-avoid {
  break-inside: avoid;
}

/* 解密高亮样式 */
.reader-text :deep(.decoder-entity) {
  cursor: pointer;
  border-bottom: 2px dotted currentColor;
  padding-bottom: 1px;
  transition: all 0.2s ease;
}

.reader-text :deep(.decoder-entity:hover) {
  background-color: rgba(var(--primary-rgb, 59, 130, 246), 0.1);
  border-bottom-style: solid;
}

.reader-text :deep(.decoder-high) {
  border-color: rgb(34, 197, 94);
}

.reader-text :deep(.decoder-high:hover) {
  background-color: rgba(34, 197, 94, 0.1);
}

.reader-text :deep(.decoder-medium) {
  border-color: rgb(234, 179, 8);
}

.reader-text :deep(.decoder-medium:hover) {
  background-color: rgba(234, 179, 8, 0.1);
}

.reader-text :deep(.decoder-low) {
  border-color: rgb(239, 68, 68);
}

.reader-text :deep(.decoder-low:hover) {
  background-color: rgba(239, 68, 68, 0.1);
}
</style>
