<script setup lang="ts">
/**
 * 书源管理页面 - 统一风格版
 * 特性：导入、启停、删除、只读查看定义
 */
import { Download, Upload } from "lucide-vue-next";
import ImportSource from "@/components/source/ImportSource.vue";
import EditSource from "@/components/source/EditSource.vue";
import {
  PageHeader,
  ManageModeBar,
} from "@/components/common";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useSourcesPageView } from "@/composables/useSourcesPageView";
import SourcesLocalTab from "@/components/sources/SourcesLocalTab.vue";

const {
  searchKeyword,
  activeGroup,
  activeTab,
  loading,
  groups,
  filteredSources,
  isManageMode,
  selectedSourceIds,
  isSourceSelected,
  toggleSelect,
  selectAll,
  toggleManageMode,
  stats,
  showImport,
  showEdit,
  currentEditSource,
  toggleEnable,
  openImport,
  openEdit,
  deleteSource,
  batchDelete,
  exportSources,
  deleteGroupSources,
  loadSources,
  goBack,
} = useSourcesPageView();
</script>

<template>
  <div class="min-h-screen bg-background selection:bg-primary/20">
    <div class="h-safe-top" />

    <!-- 主内容区 -->
    <main class="px-5 max-w-7xl mx-auto pt-6 sm:pt-8 pb-32">
      <Tabs v-model="activeTab" class="w-full">
        <!-- Page Header with Integrated Tabs -->
        <PageHeader
          :search-value="searchKeyword"
          search-placeholder="搜索书源名称、URL或分组..."
          :actions="activeTab === 'local' ? [
            {
              label: '导出',
              icon: Download,
              onClick: exportSources,
              variant: 'outline',
              hideLabelOnMobile: true,
            },
            {
              label: '导入书源',
              icon: Upload,
              onClick: openImport,
              variant: 'default',
            },
          ] : []"
          @update:search-value="searchKeyword = $event"
          @back="goBack"
        >
          <template #left>
            <TabsList class="mr-4">
              <TabsTrigger value="local">本地书源</TabsTrigger>
            </TabsList>
          </template>
        </PageHeader>

        <TabsContent value="local" class="space-y-6">
          <SourcesLocalTab
            v-model:active-group="activeGroup"
            :search-keyword="searchKeyword"
            :groups="groups"
            :loading="loading"
            :filtered-sources="filteredSources"
            :is-manage-mode="isManageMode"
            :stats="stats"
            :is-source-selected="isSourceSelected"
            @toggle-manage-mode="toggleManageMode"
            @toggle-select="toggleSelect"
            @open-edit="openEdit"
            @toggle-enable="(source, enabled) => toggleEnable(source, enabled)"
            @delete-source="deleteSource"
            @delete-group-sources="deleteGroupSources"
            @open-import="openImport"
            @reset-filters="
              () => {
                searchKeyword = ''
                activeGroup = '全部'
              }
            "
          />
      </TabsContent>

    </Tabs>
    </main>

    <ManageModeBar
      v-if="isManageMode"
      :selected-count="selectedSourceIds.size"
      :total-count="filteredSources.length"
      @select-all="selectAll"
      @delete="batchDelete"
      @close="toggleManageMode"
    />

    <ImportSource v-model:open="showImport" @success="loadSources" />
    <EditSource
      v-model:open="showEdit"
      :source="currentEditSource"
      @saved="loadSources"
    />
  </div>
</template>

<style scoped>
.h-safe-top {
  height: env(safe-area-inset-top);
}
</style>
