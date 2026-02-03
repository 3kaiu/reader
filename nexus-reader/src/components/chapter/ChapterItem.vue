<template>
  <div
    class="chapter-item"
    :class="{
      'chapter-active': chapter.id === activeChapterId,
      'chapter-read': chapter.isRead,
      'chapter-downloading': chapter.isDownloading,
      'chapter-cached': chapter.isCached,
      'chapter-selected': isSelected,
    }"
    @click="handleClick"
    @contextmenu="handleContextMenu"
  >
    <!-- 章节状态指示器 -->
    <ChapterStatus :status="chapterStatus" :progress="chapter.readProgress" />

    <!-- 章节信息 -->
    <div class="chapter-info">
      <div class="chapter-title">{{ chapter.title }}</div>
      <div class="chapter-meta">
        <span class="chapter-number">第{{ chapter.number }}章</span>
        <span v-if="chapter.wordCount" class="chapter-words">{{
          formatWordCount(chapter.wordCount)
        }}</span>
        <span v-if="chapter.publishTime" class="chapter-time">{{
          formatTime(chapter.publishTime)
        }}</span>
      </div>
      <div v-if="chapter.summary" class="chapter-summary">
        {{ chapter.summary }}
      </div>
      <div v-if="chapter.readProgress > 0" class="chapter-progress">
        <div class="progress-bar">
          <div
            class="progress-fill"
            :style="{ width: chapter.readProgress + '%' }"
          ></div>
        </div>
        <span class="progress-text"
          >{{ Math.round(chapter.readProgress) }}%</span
        >
      </div>
    </div>

    <!-- 章节操作 -->
    <div class="chapter-actions">
      <button
        v-if="!chapter.isCached && !chapter.isDownloading"
        @click.stop="handleDownload"
        class="action-btn download"
        :title="$t('chapter.download')"
      >
        ⬇️
      </button>
      <button
        v-else-if="chapter.isCached"
        @click.stop="handleRemoveCache"
        class="action-btn remove"
        :title="$t('chapter.removeCache')"
      >
        🗑️
      </button>
      <button
        v-if="chapter.isDownloading"
        class="action-btn downloading"
        disabled
        :title="$t('chapter.downloading')"
      >
        <div class="spinner"></div>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import ChapterStatus from "./ChapterStatus.vue";

export interface Chapter {
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
  chapter: Chapter;
  activeChapterId?: string;
  isSelected?: boolean;
  showProgress?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  showProgress: true,
});

const emit = defineEmits<{
  click: [chapter: Chapter];
  contextMenu: [event: MouseEvent, chapter: Chapter];
  download: [chapter: Chapter];
  removeCache: [chapter: Chapter];
}>();

// 计算章节状态
const chapterStatus = computed(() => {
  if (props.chapter.isDownloading) return "downloading";
  if (props.chapter.isCached) return "cached";
  if (props.chapter.isRead) return "read";
  return "unread";
});

// 事件处理
const handleClick = () => {
  emit("click", props.chapter);
};

const handleContextMenu = (event: MouseEvent) => {
  emit("contextMenu", event, props.chapter);
};

const handleDownload = () => {
  emit("download", props.chapter);
};

const handleRemoveCache = () => {
  emit("removeCache", props.chapter);
};

// 工具函数
const formatWordCount = (count: number): string => {
  if (count >= 10000) {
    return `${(count / 10000).toFixed(1)}万字`;
  }
  return `${count}字`;
};

const formatTime = (time: string): string => {
  const date = new Date(time);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return "今天";
  if (days === 1) return "昨天";
  if (days < 7) return `${days}天前`;
  return date.toLocaleDateString();
};
</script>

<style scoped>
.chapter-item {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color, #e0e0e0);
  cursor: pointer;
  transition: background-color 0.2s;
  min-height: 60px;
}

.chapter-item:hover {
  background-color: var(--hover-bg, #f5f5f5);
}

.chapter-item.chapter-active {
  background-color: var(--active-bg, #e3f2fd);
  border-left: 3px solid var(--primary-color, #1976d2);
}

.chapter-item.chapter-read .chapter-title {
  color: var(--read-text, #666);
}

.chapter-item.chapter-selected {
  background-color: var(--selected-bg, #fff3e0);
}

.chapter-info {
  flex: 1;
  min-width: 0;
}

.chapter-title {
  font-weight: 500;
  margin-bottom: 4px;
  word-break: break-word;
  line-height: 1.4;
}

.chapter-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--meta-color, #888);
  margin-bottom: 2px;
}

.chapter-summary {
  font-size: 13px;
  color: var(--summary-color, #666);
  line-height: 1.4;
  margin-top: 4px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.chapter-progress {
  margin-top: 6px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.progress-bar {
  flex: 1;
  height: 4px;
  background-color: var(--progress-bg, #e0e0e0);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background-color: var(--progress-color, #1976d2);
  transition: width 0.3s;
}

.progress-text {
  font-size: 11px;
  color: var(--progress-text, #666);
  min-width: 32px;
}

.chapter-actions {
  display: flex;
  gap: 4px;
  margin-left: 12px;
}

.action-btn {
  padding: 6px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.action-btn:hover:not(:disabled) {
  transform: scale(1.1);
}

.action-btn.download {
  background-color: var(--download-bg, #e8f5e8);
  color: var(--download-color, #2e7d32);
}

.action-btn.remove {
  background-color: var(--remove-bg, #ffebee);
  color: var(--remove-color, #c62828);
}

.action-btn.downloading {
  background-color: var(--downloading-bg, #fff3e0);
  color: var(--downloading-color, #ef6c00);
}

.spinner {
  width: 12px;
  height: 12px;
  border: 2px solid var(--spinner-color, #ef6c00);
  border-top: 2px solid transparent;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

/* 响应式设计 */
@media (max-width: 768px) {
  .chapter-item {
    padding: 10px 12px;
    min-height: 50px;
  }

  .chapter-meta {
    flex-direction: column;
    gap: 2px;
  }

  .chapter-actions {
    margin-left: 8px;
  }
}
</style>
