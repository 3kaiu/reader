<template>
  <div class="chapter-list-controls">
    <!-- 搜索栏 -->
    <div v-if="showSearch" class="search-section">
      <div class="search-input-wrapper">
        <input
          v-model="searchQuery"
          type="text"
          :placeholder="$t('chapter.searchPlaceholder')"
          class="search-input"
          @keydown.enter="handleSearch"
        />
        <button
          v-if="searchQuery"
          @click="clearSearch"
          class="clear-btn"
          :title="$t('common.clear')"
        >
          ✕
        </button>
      </div>

      <div v-if="searchResults.length > 0" class="search-results">
        找到 {{ searchResults.length }} 个结果
      </div>
    </div>

    <!-- 操作栏 -->
    <div class="actions-section">
      <div class="left-actions">
        <!-- 批量选择 -->
        <div v-if="enableBatchSelect" class="batch-controls">
          <button
            @click="selectAll"
            class="action-btn"
            :disabled="totalChapters === 0"
          >
            {{ $t("chapter.selectAll") }}
          </button>
          <button
            @click="selectUnread"
            class="action-btn"
            :disabled="totalChapters === 0"
          >
            {{ $t("chapter.selectUnread") }}
          </button>
          <button
            v-if="selectedCount > 0"
            @click="$emit('batchDownload')"
            class="action-btn primary"
          >
            ⬇️ {{ $t("chapter.batchDownload") }}
          </button>
          <button
            v-if="selectedCount > 0"
            @click="$emit('batchMarkRead')"
            class="action-btn primary"
          >
            ✓ {{ $t("chapter.batchMarkRead") }}
          </button>
          <button
            v-if="selectedCount > 0"
            @click="$emit('clearSelection')"
            class="action-btn secondary"
          >
            ✕ {{ $t("chapter.clearSelection") }}
          </button>
        </div>

        <!-- 章节统计 -->
        <div class="stats">
          <span class="stat-item"> 共 {{ totalChapters }} 章 </span>
          <span v-if="filteredCount !== totalChapters" class="stat-item">
            显示 {{ filteredCount }} 章
          </span>
          <span v-if="selectedCount > 0" class="stat-item selected">
            已选 {{ selectedCount }} 章
          </span>
        </div>
      </div>

      <div class="right-actions">
        <!-- 快速跳转 -->
        <div v-if="showQuickJump" class="quick-jump">
          <input
            v-model.number="jumpTarget"
            type="number"
            :placeholder="$t('chapter.jumpTo')"
            class="jump-input"
            :min="1"
            :max="totalChapters"
            @keydown.enter="handleJump"
          />
          <button
            @click="handleJump"
            class="jump-btn"
            :disabled="
              !jumpTarget || jumpTarget < 1 || jumpTarget > totalChapters
            "
          >
            {{ $t("chapter.jump") }}
          </button>
        </div>

        <!-- 调试信息 -->
        <button
          v-if="showDebugInfo"
          @click="$emit('toggleDebug')"
          class="debug-btn"
          :title="$t('chapter.toggleDebug')"
        >
          🐛
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";

interface Props {
  searchQuery: string;
  showQuickJump: boolean;
  showSearch: boolean;
  enableBatchSelect: boolean;
  totalChapters: number;
  filteredCount: number;
  selectedCount: number;
  showDebugInfo: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  showDebugInfo: false,
});

const emit = defineEmits<{
  "update:searchQuery": [value: string];
  toggleDebug: [];
  batchDownload: [];
  batchMarkRead: [];
  clearSelection: [];
  jumpTo: [chapterNumber: number];
}>();

// 响应式状态
const jumpTarget = ref<number>();
const searchResults = ref<Array<any>>([]);

// 计算属性
const searchQuery = computed({
  get: () => props.searchQuery,
  set: (value) => emit("update:searchQuery", value),
});

// 方法
const handleSearch = () => {
  // 搜索逻辑由父组件处理
  if (searchQuery.value.trim()) {
    // 这里可以添加搜索历史记录
  }
};

const clearSearch = () => {
  searchQuery.value = "";
  searchResults.value = [];
};

const selectAll = () => {
  // 全选逻辑由父组件处理
  emit("batchSelectAll");
};

const selectUnread = () => {
  // 选择未读章节逻辑由父组件处理
  emit("batchSelectUnread");
};

const handleJump = () => {
  if (
    jumpTarget.value &&
    jumpTarget.value >= 1 &&
    jumpTarget.value <= props.totalChapters
  ) {
    emit("jumpTo", jumpTarget.value);
    jumpTarget.value = undefined;
  }
};

// 监听搜索查询变化
watch(
  () => props.searchQuery,
  (newQuery) => {
    if (newQuery.trim()) {
      // 模拟搜索结果（实际由父组件提供）
      searchResults.value = []; // 父组件会更新这个
    } else {
      searchResults.value = [];
    }
  }
);
</script>

<style scoped>
.chapter-list-controls {
  background-color: var(--surface-color, #ffffff);
  border-bottom: 1px solid var(--border-color, #e0e0e0);
  position: sticky;
  top: 0;
  z-index: 10;
}

.search-section {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color, #e0e0e0);
}

.search-input-wrapper {
  position: relative;
  max-width: 400px;
}

.search-input {
  width: 100%;
  padding: 8px 32px 8px 12px;
  border: 1px solid var(--border-color, #ddd);
  border-radius: 6px;
  font-size: 14px;
  transition: border-color 0.2s;
}

.search-input:focus {
  outline: none;
  border-color: var(--primary-color, #1976d2);
}

.clear-btn {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: var(--text-secondary, #666);
  cursor: pointer;
  padding: 4px;
  border-radius: 50%;
  transition: background-color 0.2s;
}

.clear-btn:hover {
  background-color: var(--hover-bg, #f0f0f0);
}

.search-results {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary, #666);
}

.actions-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  min-height: 48px;
}

.left-actions,
.right-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.batch-controls {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.stats {
  display: flex;
  gap: 12px;
  font-size: 13px;
  color: var(--text-secondary, #666);
}

.stat-item.selected {
  color: var(--primary-color, #1976d2);
  font-weight: 500;
}

.quick-jump {
  display: flex;
  gap: 4px;
}

.jump-input {
  width: 60px;
  padding: 4px 8px;
  border: 1px solid var(--border-color, #ddd);
  border-radius: 4px;
  font-size: 13px;
  text-align: center;
}

.jump-input:focus {
  outline: none;
  border-color: var(--primary-color, #1976d2);
}

.jump-btn {
  padding: 4px 8px;
  background-color: var(--primary-color, #1976d2);
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.jump-btn:hover:not(:disabled) {
  background-color: var(--primary-hover, #1565c0);
}

.jump-btn:disabled {
  background-color: var(--disabled-bg, #ccc);
  cursor: not-allowed;
}

.action-btn {
  padding: 6px 12px;
  border: 1px solid var(--border-color, #ddd);
  border-radius: 4px;
  background-color: white;
  color: var(--text-color, #333);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover:not(:disabled) {
  background-color: var(--hover-bg, #f5f5f5);
  border-color: var(--primary-color, #1976d2);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-btn.primary {
  background-color: var(--primary-color, #1976d2);
  color: white;
  border-color: var(--primary-color, #1976d2);
}

.action-btn.primary:hover:not(:disabled) {
  background-color: var(--primary-hover, #1565c0);
}

.action-btn.secondary {
  background-color: var(--secondary-bg, #f5f5f5);
  color: var(--text-secondary, #666);
}

.debug-btn {
  padding: 4px;
  background: none;
  border: 1px solid var(--border-color, #ddd);
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.debug-btn:hover {
  background-color: var(--hover-bg, #f5f5f5);
  border-color: var(--primary-color, #1976d2);
}

/* 响应式设计 */
@media (max-width: 768px) {
  .actions-section {
    flex-direction: column;
    gap: 8px;
    align-items: stretch;
  }

  .left-actions,
  .right-actions {
    justify-content: center;
  }

  .batch-controls {
    justify-content: center;
  }

  .stats {
    justify-content: center;
  }

  .quick-jump {
    justify-content: center;
  }
}

@media (max-width: 480px) {
  .chapter-list-controls {
    /* 极小屏幕优化 */
  }

  .batch-controls {
    flex-direction: column;
    width: 100%;
  }

  .action-btn {
    flex: 1;
    min-width: 0;
  }
}
</style>
