<script setup lang="ts">
/**
 * 词典管理页面
 * 查看、编辑、导入导出解密词典
 */
import {
  Plus,
  Upload,
  Download,
} from 'lucide-vue-next'
import DecoderDictionaryFilters from '@/components/decoder/DecoderDictionaryFilters.vue'
import DecoderDictionaryEditDialog from '@/components/decoder/DecoderDictionaryEditDialog.vue'
import DecoderDictionaryEntryGrid from '@/components/decoder/DecoderDictionaryEntryGrid.vue'
import DecoderDictionaryToolbar from '@/components/decoder/DecoderDictionaryToolbar.vue'
import { useDecoderDictionaryPageView } from '@/composables/useDecoderDictionaryPageView'
import {
  PageHeader,
  ManageModeBar,
} from '@/components/common'

const {
  searchKeyword,
  filterCategory,
  filterLevel,
  filteredEntries,
  loading,
  isManageMode,
  selectedEntries,
  toggleSelect,
  selectAll,
  toggleManageMode,
  stats,
  showEdit,
  currentEditEntry,
  editForm,
  importInputRef,
  handleImportEntries,
  triggerImport,
  openEdit,
  closeEdit,
  saveEntry,
  deleteEntry,
  batchDelete,
  exportEntries,
  goBack,
} = useDecoderDictionaryPageView()
</script>

<template>
  <div class="min-h-screen bg-background selection:bg-primary/20">
    <div class="h-safe-top" />

    <!-- 主内容区 -->
    <main class="px-5 max-w-7xl mx-auto pt-6 sm:pt-8 pb-32">
      <!-- 页面头部 -->
      <PageHeader
        :search-value="searchKeyword"
        :search-placeholder="'搜索加密词或真实指代...'"
        :actions="[
          {
            label: '导出',
            icon: Download,
            onClick: exportEntries,
            variant: 'outline',
            hideLabelOnMobile: true,
          },
          {
            label: '导入',
            icon: Upload,
            onClick: triggerImport,
            variant: 'outline',
            hideLabelOnMobile: true,
          },
          {
            label: '新增词条',
            icon: Plus,
            onClick: () => openEdit(),
            variant: 'default',
          },
        ]"
        @update:search-value="searchKeyword = $event"
        @back="goBack"
      />

      <!-- 隐藏的导入输入框 -->
      <input
        ref="importInputRef"
        type="file"
        accept=".json"
        class="hidden"
        @change="handleImportEntries"
      />

      <DecoderDictionaryFilters
        :filter-category="filterCategory"
        :filter-level="filterLevel"
        @update:filter-category="filterCategory = $event"
        @update:filter-level="filterLevel = $event"
      />

      <DecoderDictionaryToolbar
        :filtered-count="stats.filtered"
        :person-count="stats.byCategory.person"
        :company-count="stats.byCategory.company"
        :place-count="stats.byCategory.place"
        :is-manage-mode="isManageMode"
        @toggle-manage="toggleManageMode"
      />

      <DecoderDictionaryEntryGrid
        :loading="loading"
        :entries="filteredEntries"
        :search-keyword="searchKeyword"
        :is-manage-mode="isManageMode"
        :selected-entry-ids="selectedEntries"
        @edit="openEdit"
        @delete="deleteEntry"
        @toggle-select="toggleSelect"
        @clear-search="searchKeyword = ''"
      />
    </main>

    <!-- 底部操作栏 (管理模式) -->
    <ManageModeBar
      v-if="isManageMode"
      :selected-count="selectedEntries.size"
      :total-count="filteredEntries.length"
      @select-all="selectAll(filteredEntries)"
      @delete="batchDelete"
      @close="toggleManageMode"
    />

    <DecoderDictionaryEditDialog
      :open="showEdit"
      :current-edit-entry="currentEditEntry"
      :edit-form="editForm"
      @close="closeEdit"
      @save="saveEntry"
    />
  </div>
</template>

<style scoped>
.h-safe-top {
  height: env(safe-area-inset-top, 0px);
}
</style>
