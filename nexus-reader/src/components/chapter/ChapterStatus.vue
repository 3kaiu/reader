<template>
  <div class="chapter-status">
    <div
      v-if="status === 'downloading'"
      class="status-icon downloading"
      :title="$t('chapter.downloading')"
    >
      <div class="spinner"></div>
    </div>

    <div
      v-else-if="status === 'cached'"
      class="status-icon cached"
      :title="$t('chapter.cached')"
    >
      📱
    </div>

    <div
      v-else-if="status === 'read'"
      class="status-icon read"
      :title="$t('chapter.read')"
    >
      ✓
    </div>

    <div
      v-else-if="status === 'reading'"
      class="status-icon reading"
      :title="$t('chapter.reading')"
    >
      📖
    </div>

    <div v-else class="status-icon unread" :title="$t('chapter.unread')">○</div>

    <!-- 阅读进度环（如果有进度） -->
    <div v-if="progress > 0 && progress < 100" class="progress-ring">
      <svg width="20" height="20" viewBox="0 0 20 20">
        <circle
          cx="10"
          cy="10"
          r="8"
          stroke="var(--progress-bg, #e0e0e0)"
          stroke-width="2"
          fill="none"
        />
        <circle
          cx="10"
          cy="10"
          r="8"
          stroke="var(--progress-color, #1976d2)"
          stroke-width="2"
          fill="none"
          stroke-linecap="round"
          :stroke-dasharray="`${progress * 0.5} 50`"
          transform="rotate(-90 10 10)"
        />
      </svg>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  status: "unread" | "reading" | "read" | "cached" | "downloading";
  progress?: number;
}

withDefaults(defineProps<Props>(), {
  progress: 0,
});
</script>

<style scoped>
.chapter-status {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  margin-right: 12px;
  position: relative;
}

.status-icon {
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  transition: all 0.2s;
}

.status-icon.unread {
  color: var(--unread-color, #ccc);
}

.status-icon.reading {
  color: var(--reading-color, #1976d2);
  background-color: var(--reading-bg, #e3f2fd);
}

.status-icon.read {
  color: var(--read-color, #2e7d32);
  background-color: var(--read-bg, #e8f5e8);
}

.status-icon.cached {
  color: var(--cached-color, #f57c00);
  background-color: var(--cached-bg, #fff3e0);
}

.status-icon.downloading {
  color: var(--downloading-color, #ef6c00);
  background-color: var(--downloading-bg, #fff3e0);
}

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid currentColor;
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

.progress-ring {
  position: absolute;
  top: -2px;
  left: -2px;
}

.progress-ring svg {
  width: 24px;
  height: 24px;
}

/* 响应式调整 */
@media (max-width: 768px) {
  .chapter-status {
    width: 20px;
    height: 20px;
    margin-right: 8px;
  }

  .status-icon {
    width: 16px;
    height: 16px;
    font-size: 14px;
  }

  .spinner {
    width: 12px;
    height: 12px;
  }

  .progress-ring svg {
    width: 20px;
    height: 20px;
  }
}
</style>
