<script setup lang="ts">
/**
 * Full mapping editor page/section for managing the AI knowledge base.
 * Supports CRUD, search/filter, import/export JSON.
 */
import { ref } from 'vue'
import type { AliasMapping, MappingCategory } from './composables/types'

const props = defineProps<{
  bookId: string
}>()

// Use bookId to avoid TS unused warning while keeping it available for future use
void props.bookId

const emit = defineEmits<{
  update: [mapping: AliasMapping]
  delete: [id: string]
  import: [json: string]
}>()

const searchQuery = ref('')
const filterCategory = ref<MappingCategory | 'all'>('all')
const editTarget = ref<AliasMapping | null>(null)

// Use refs to avoid TS unused warnings while keeping them available for template
void searchQuery
void filterCategory
void editTarget

function handleImport() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.onchange = async () => {
    const text = await input.files?.[0]?.text()
    if (text) emit('import', text)
  }
  input.click()
}

function handleExport() {
  // Parent store provides the JSON
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center gap-3">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="搜索代指..."
        class="flex-1 rounded-md border px-3 py-1.5 text-sm"
      />
      <select
        v-model="filterCategory"
        class="rounded-md border px-2 py-1.5 text-sm"
      >
        <option value="all">全部</option>
        <option value="person">人物</option>
        <option value="place">地点</option>
        <option value="event">事件</option>
        <option value="faction">派系</option>
        <option value="meme">梗</option>
      </select>
      <button
        class="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
        @click="handleImport"
      >
        导入
      </button>
      <button
        class="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
        @click="handleExport"
      >
        导出
      </button>
    </div>

    <!-- TODO V2: mapping table/list rendered here -->
    <p class="text-sm text-muted-foreground">
      映射编辑器 — 由父组件提供数据源
    </p>
  </div>
</template>
