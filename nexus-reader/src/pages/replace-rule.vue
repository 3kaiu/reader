<script setup lang="ts">
import {
  Plus,
  Upload,
  Download,
} from "lucide-vue-next";
import { useReplaceRulePageView } from "@/composables/useReplaceRulePageView";
import EditRule from "@/components/replace/EditRule.vue";
import ImportRule from "@/components/replace/ImportRule.vue";
import {
  PageHeader,
  ManageModeBar,
} from "@/components/common";
import ReplaceRuleList from "@/components/replace-rules/ReplaceRuleList.vue";

const {
  searchKeyword,
  loading,
  filteredRules,
  isManageMode,
  selectedRuleKeys,
  isRuleSelected,
  toggleSelect,
  selectAll,
  toggleManageMode,
  stats,
  showImport,
  showEdit,
  currentEditRule,
  toggleEnabled,
  openImport,
  openEdit,
  deleteRule,
  batchDelete,
  exportRules,
  loadRules,
  goBack,
} = useReplaceRulePageView();
</script>

<template>
  <div class="min-h-screen bg-background selection:bg-primary/20">
    <div class="h-safe-top" />

    <!-- 主内容区 -->
    <main class="px-5 max-w-7xl mx-auto pt-6 sm:pt-8 pb-32">
      <PageHeader
        :search-value="searchKeyword"
        :search-placeholder="'搜索规则名称、模式或范围...'"
        :actions="[
          {
            label: '导出',
            icon: Download,
            onClick: exportRules,
            variant: 'outline',
            hideLabelOnMobile: true,
          },
          {
            label: '导入',
            icon: Upload,
            onClick: openImport,
            variant: 'outline',
            hideLabelOnMobile: true,
          },
          {
            label: '新增规则',
            icon: Plus,
            onClick: () => openEdit(),
            variant: 'default',
          },
        ]"
        @update:search-value="searchKeyword = $event"
        @back="goBack"
      />

      <ReplaceRuleList
        :search-keyword="searchKeyword"
        :loading="loading"
        :filtered-rules="filteredRules"
        :is-manage-mode="isManageMode"
        :stats="stats"
        :is-rule-selected="isRuleSelected"
        @toggle-manage-mode="toggleManageMode"
        @toggle-select="toggleSelect"
        @open-edit="openEdit"
        @delete-rule="deleteRule"
        @toggle-enabled="(rule, enabled) => toggleEnabled(rule, enabled)"
        @reset-search="searchKeyword = ''"
      />
    </main>

    <!-- 底部操作栏 (管理模式) -->
    <ManageModeBar
      v-if="isManageMode"
      :selected-count="selectedRuleKeys.size"
      :total-count="filteredRules.length"
      @select-all="selectAll"
      @delete="batchDelete"
      @close="toggleManageMode"
    />

    <!-- Modals -->
    <ImportRule v-model:open="showImport" @success="loadRules" />
    <EditRule
      v-model:open="showEdit"
      :rule="currentEditRule"
      @saved="loadRules"
    />
  </div>
</template>

<style scoped>
.h-safe-top {
  height: env(safe-area-inset-top, 0px);
}
</style>
