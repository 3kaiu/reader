<template>
  <div class="virtual-chapter-list">
    <!-- 列表控制栏 -->
    <ChapterListControls
      v-model:search-query="searchQuery"
      :show-quick-jump="showQuickJump"
      :show-search="showSearch"
      :enable-batch-select="enableBatchSelect"
      :total-chapters="chapters.length"
      :filtered-count="filteredChapters.length"
      :selected-count="selectedChapters.size"
      :show-debug-info="showDebugInfo"
      @toggle-debug="showDebugInfo = !showDebugInfo"
      @batch-download="handleBatchDownload"
      @batch-mark-read="handleBatchMarkRead"
      @clear-selection="clearSelection"
    />

    <!-- 虚拟滚动列表 -->
    <VirtualScroller
      ref="scrollerRef"
      :items="filteredChapters"
      :item-height="getChapterHeight"
      :container-height="containerHeight"
      :overscan="5"
      :show-performance-info="showDebugInfo"
      :key-field="'id'"
      @visible-range-change="handleVisibleRangeChange"
      @scroll="handleScroll"
    >
      <template #default="{ item: chapter, index }">
        <ChapterItem
          :chapter="chapter"
          :active-chapter-id="activeChapterId"
          :is-selected="selectedChapters.has(chapter.id)"
          @click="handleChapterClick(chapter, getOriginalIndex(chapter))"
          @context-menu="handleChapterContextMenu($event, chapter)"
          @download="handleDownload(chapter)"
          @remove-cache="handleRemoveCache(chapter)"
        />
      </template>
    </VirtualScroller>

    <!-- 批量操作提示 -->
    <div v-if="selectedChapters.size > 0" class="batch-notice">
      已选择 {{ selectedChapters.size }} 个章节
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import VirtualScroller from "../VirtualScroller.vue";
import ChapterItem from "./ChapterItem.vue";
import ChapterListControls from "./ChapterListControls.vue";

interface Chapter {
  id: string;
  number: number;
  title: string;
  summary?: string;
  wordCount?: number;
  publishTime?: string;
  isRead: boolean;
  readProgress: number;
  isCached: boolean;
  isDownloading: boolean;
  url: string;
}

interface Props {
  chapters: Chapter[];
  activeChapterId?: string;
  containerHeight?: number;
  showQuickJump?: boolean;
  showSearch?: boolean;
  enableBatchSelect?: boolean;
  chapterHeight?: number;
}

const props = withDefaults(defineProps<Props>(), {
  containerHeight: 600,
  showQuickJump: true,
  showSearch: false,
  enableBatchSelect: false,
  chapterHeight: 80,
});

const emit = defineEmits<{
  chapterClick: [chapter: Chapter, index: number];
  chapterContextMenu: [event: MouseEvent, chapter: Chapter];
  download: [chapter: Chapter];
  removeCache: [chapter: Chapter];
  batchDownload: [chapters: Chapter[]];
  batchMarkRead: [chapters: Chapter[]];
  visibleRangeChange: [range: { start: number; end: number }];
}>();

// 响应式状态
const scrollerRef = ref<InstanceType<typeof VirtualScroller>>();
const searchQuery = ref("");
const selectedChapters = ref<Set<string>>(new Set());
const showDebugInfo = ref(false);

// 计算属性
const filteredChapters = computed(() => {
  if (!searchQuery.value) return props.chapters;

  const query = searchQuery.value.toLowerCase();
  return props.chapters.filter(
    (chapter) =>
      chapter.title.toLowerCase().includes(query) ||
      chapter.number.toString().includes(query)
  );
});

// 获取原始索引（用于过滤后的列表）
const getOriginalIndex = (chapter: Chapter): number => {
  return props.chapters.findIndex((c) => c.id === chapter.id);
};

// 事件处理
const getChapterHeight = (chapter: Chapter, index: number): number => {
  let height = props.chapterHeight;

  // 根据内容调整高度
  if (chapter.summary) {
    height += 20; // 摘要行高度
  }

  if (chapter.readProgress > 0) {
    height += 15; // 进度条高度
  }

  return height;
};

const handleChapterClick = (chapter: Chapter, originalIndex: number) => {
  if (props.enableBatchSelect && (window.event as MouseEvent)?.ctrlKey) {
    toggleChapterSelection(chapter.id);
  } else {
    emit("chapterClick", chapter, originalIndex);
  }
};

const handleChapterContextMenu = (event: MouseEvent, chapter: Chapter) => {
  event.preventDefault();
  emit("chapterContextMenu", event, chapter);
};

const handleDownload = async (chapter: Chapter) => {
  try {
    chapter.isDownloading = true;
    emit("download", chapter);
  } catch (error: any) {
    console.error("Download failed:", error);
    chapter.isDownloading = false;
  }
};

const handleRemoveCache = (chapter: Chapter) => {
  emit("removeCache", chapter);
};

const handleBatchDownload = () => {
  const selected = props.chapters.filter((c) =>
    selectedChapters.value.has(c.id)
  );
  emit("batchDownload", selected);
};

const handleBatchMarkRead = () => {
  const selected = props.chapters.filter((c) =>
    selectedChapters.value.has(c.id)
  );
  emit("batchMarkRead", selected);
  clearSelection();
};

const handleVisibleRangeChange = (range: { start: number; end: number }) => {
  emit("visibleRangeChange", range);
};

const handleScroll = (scrollTop: number) => {
  // 可以在这里添加滚动优化逻辑
};

// 批量选择相关
const toggleChapterSelection = (chapterId: string) => {
  if (selectedChapters.value.has(chapterId)) {
    selectedChapters.value.delete(chapterId);
  } else {
    selectedChapters.value.add(chapterId);
  }
};

const clearSelection = () => {
  selectedChapters.value.clear();
};

// 快捷跳转
const jumpToChapter = (chapterNumber: number) => {
  const index = props.chapters.findIndex((c) => c.number === chapterNumber);
  if (index >= 0 && scrollerRef.value) {
    scrollerRef.value.scrollToIndex(index);
  }
};

// 暴露方法
defineExpose({
  jumpToChapter,
  clearSelection,
  getSelectedChapters: () =>
    props.chapters.filter((c) => selectedChapters.value.has(c.id)),
});
</script>

<style scoped>
.virtual-chapter-list {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--bg-color, #ffffff);
}

.batch-notice {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background-color: var(--primary-color, #1976d2);
  color: white;
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 14px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  animation: slideUp 0.3s ease-out;
}

@keyframes slideUp {
  from {
    transform: translateX(-50%) translateY(100%);
    opacity: 0;
  }
  to {
    transform: translateX(-50%) translateY(0);
    opacity: 1;
  }
}

/* 响应式设计 */
@media (max-width: 768px) {
  .virtual-chapter-list {
    /* 移动端优化 */
  }
}
</style>
