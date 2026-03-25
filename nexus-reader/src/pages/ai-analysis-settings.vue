<script setup lang="ts">
/**
 * AI 映射规则管理页面
 * 管理映射规则与分析历史
 */
import {
  Plus,
  Upload,
  Download,
} from "lucide-vue-next"
import AiAnalysisHistoryPanel from "@/components/ai-analysis/AiAnalysisHistoryPanel.vue"
import AiAnalysisMappingDialog from "@/components/ai-analysis/AiAnalysisMappingDialog.vue"
import AiAnalysisMappingGrid from "@/components/ai-analysis/AiAnalysisMappingGrid.vue"
import AiAnalysisSettingsNotice from "@/components/ai-analysis/AiAnalysisSettingsNotice.vue"
import AiAnalysisSettingsToolbar from "@/components/ai-analysis/AiAnalysisSettingsToolbar.vue"
import { useAiAnalysisSettingsView } from "@/composables/useAiAnalysisSettingsView"
import { PageHeader } from "@/components/common"

const {
  history,
  searchKeyword,
  filterType,
  displayMappings,
  stats,
  importInputRef,
  importMappings,
  triggerImport,
  showAddDialog,
  editingRule,
  newRule,
  goBack,
  openAddDialog,
  closeAddDialog,
  saveMapping,
  deleteMapping,
  toggleMapping,
  exportMappings,
  clearHistory,
} = useAiAnalysisSettingsView()
</script>

<template>
  <div class="min-h-screen bg-background selection:bg-primary/20">
    <div class="h-safe-top" />

    <!-- 主内容区 -->
    <main class="px-5 max-w-7xl mx-auto pt-6 sm:pt-8 pb-32">
      <!-- 页面头部 -->
      <PageHeader
        :search-value="searchKeyword"
        search-placeholder="搜索映射规则..."
        :actions="[
          {
            label: '导入',
            icon: Upload,
            onClick: triggerImport,
            variant: 'outline',
            hideLabelOnMobile: true,
          },
          {
            label: '导出',
            icon: Download,
            onClick: exportMappings,
            variant: 'outline',
            hideLabelOnMobile: true,
          },
          {
            label: '添加规则',
            icon: Plus,
            onClick: () => openAddDialog(),
            variant: 'default',
          },
        ]"
        @update:search-value="searchKeyword = $event"
        @back="goBack"
      />

      <input
        ref="importInputRef"
        type="file"
        accept=".json"
        class="hidden"
        @change="importMappings"
      />

      <AiAnalysisSettingsToolbar
        :total="stats.total"
        :enabled="stats.enabled"
        :filter-type="filterType"
        @update:filter-type="filterType = $event"
      />

      <AiAnalysisSettingsNotice />

      <AiAnalysisMappingGrid
        :mappings="displayMappings"
        :search-keyword="searchKeyword"
        @add="openAddDialog"
        @edit="openAddDialog"
        @delete="deleteMapping"
        @toggle="toggleMapping"
        @clear-search="searchKeyword = ''"
      />

      <AiAnalysisHistoryPanel
        :history="history"
        @clear="clearHistory"
      />
    </main>

    <AiAnalysisMappingDialog
      :open="showAddDialog"
      :editing-rule="editingRule"
      :draft="newRule"
      @close="closeAddDialog"
      @save="saveMapping"
    />
  </div>
</template>

<style scoped>
.h-safe-top {
  height: env(safe-area-inset-top, 0px);
}
</style>
