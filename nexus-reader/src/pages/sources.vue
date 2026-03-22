<script setup lang="ts">
/**
 * 书源管理页面 - 统一风格版
 * 特性：导入、启停、删除、只读查看定义
 */
import { Circle, CheckCircle2 } from "lucide-vue-next";
import {
  Server,
  Trash2,
  Upload,
  Download,
  Globe2,
  Edit2,
  X,
} from "lucide-vue-next";
import { Switch } from "@/components/ui/switch";
import ImportSource from "@/components/source/ImportSource.vue";
import EditSource from "@/components/source/EditSource.vue";
import {
  PageHeader,
  PageToolbar,
  ManageModeBar,
  EmptyState,
  LoadingGrid,
} from "@/components/common";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useSourcesPageView } from "@/composables/useSourcesPageView";

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

      <!-- 页面工具栏 -->
      <PageToolbar
        :title="activeGroup === '全部' ? '全部书源' : activeGroup"
        :icon="Server"
        :count="stats.filtered"
        :stats="[
          {
            label: '启用',
            value: stats.enabled,
            color: '#22c55e',
          },
          {
            label: '/',
            value: stats.total - stats.enabled,
          },
        ]"
        :is-manage-mode="isManageMode"
        @toggle-manage="toggleManageMode"
      />

      <!-- 分组筛选（Nexus-lite 暂不支持源分组，暂时隐藏） -->
      <div v-if="false" class="flex items-center gap-3 mb-6 -mt-4">
        <div class="flex-1"></div>
        <div
          class="flex-1 overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0"
        >
          <div class="flex items-center gap-2 pb-2 sm:pb-0">
            <button
              v-for="[group, count] in groups.filter(
                ([name]) => name !== '全部'
              )"
              :key="group"
              class="relative px-3 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap snap-start select-none group/btn"
              :class="
                activeGroup === group
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              "
              @click="activeGroup = group"
            >
              {{ group }}
              <span class="ml-1 opacity-60 text-xs">{{ count }}</span>

              <!-- 删除分组按钮 (仅在Hover且非未分组时显示) -->
              <button
                v-if="group !== '未分组' && activeGroup === group"
                class="absolute -top-1 -right-1 w-4 h-4 rounded-md bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover/btn:opacity-100 transition-opacity hover:scale-110"
                @click.stop="deleteGroupSources(group)"
                aria-label="删除分组"
              >
                <X class="h-2.5 w-2.5" />
              </button>
            </button>
          </div>
        </div>
        <div class="flex-1"></div>
      </div>

      <!-- 加载状态 -->
      <LoadingGrid v-if="loading" />

      <!-- 空状态 -->
      <EmptyState
        v-else-if="filteredSources.length === 0"
        :icon="Server"
        :title="
          searchKeyword
            ? '未找到匹配的书源'
            : activeGroup === '全部'
            ? '暂无书源'
            : `「${activeGroup}」分组为空`
        "
        :description="
          searchKeyword
            ? '尝试更换搜索关键词'
            : activeGroup === '全部'
            ? '导入书源开始使用'
            : '切换到其他分组或导入新书源'
        "
        :actions="[
          {
            label: '导入书源',
            icon: Upload,
            onClick: openImport,
          },
          ...(searchKeyword || activeGroup !== '全部'
            ? [
                {
                  label: '查看全部',
                  onClick: () => {
                    searchKeyword = ''
                    activeGroup = '全部'
                  },
                  variant: 'outline' as const,
                },
              ]
            : []),
        ]"
      />

      <!-- 书源列表 (网格布局) -->
      <div
        v-else
        class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500"
      >
        <div
          v-for="source in filteredSources"
          :key="source.id"
          class="group relative bg-card hover:bg-muted/50 rounded-xl border border-transparent transition-all duration-200 cursor-pointer overflow-hidden"
          :class="{
            'bg-muted/20': isSourceSelected(source) && isManageMode,
            'border-border/40 hover:border-border hover:shadow-sm': !isManageMode || !isSourceSelected(source),
            'opacity-60': source.enabled === false && !isManageMode,
          }"
          @click="isManageMode ? toggleSelect(source) : openEdit(source)"
        >
          <div class="px-3 py-3 flex items-center gap-3">
            <!-- 1. 左侧图标 / 选中框 -->
            <div class="shrink-0 flex items-center justify-center">
               <div
                  v-if="isManageMode"
                  class="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
                  :class="isSourceSelected(source) ? 'text-primary' : 'text-muted-foreground/30'"
                >
                  <CheckCircle2 v-if="isSourceSelected(source)" class="w-5 h-5 fill-primary/10" />
                  <Circle v-else class="w-5 h-5" />
                </div>
                <div
                  v-else
                  class="w-8 h-8 rounded-lg bg-primary/5 text-primary flex items-center justify-center"
                  :class="{'grayscale opacity-50': !source.enabled}"
                >
                  <Globe2 class="h-4 w-4" />
                </div>
            </div>

            <!-- 2. 中间信息 -->
            <div class="flex-1 min-w-0 flex flex-col justify-center">
              <h3 class="text-sm font-medium leading-none mb-1.5 truncate pr-2">
                {{ source.name }}
              </h3>
              <p class="text-[10px] text-muted-foreground/50 font-mono truncate">
                {{ source.url.replace(/https?:\/\//, "").replace(/\/$/, "") }}
              </p>
            </div>

            <!-- 3. 右侧操作 (Switch / Actions) -->
            <div class="shrink-0 flex items-center h-full">
              <!-- 管理模式下隐藏操作 -->
              <template v-if="!isManageMode">
                <!-- 默认显示 Switch -->
                <div class="group-hover:hidden flex items-center">
                   <Switch
                      :checked="source.enabled"
                      @update:checked="(val: boolean) => toggleEnable(source, val)"
                      @click.stop
                      class="scale-75 origin-right data-[state=checked]:bg-primary"
                    />
                </div>

                <!-- Hover 显示操作按钮 -->
                <div class="hidden group-hover:flex items-center gap-1 -mr-1">
                   <button
                    class="w-7 h-7 rounded-md hover:bg-background border border-transparent hover:border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-all"
                    @click.stop="openEdit(source)"
                    title="查看详情"
                  >
                    <Edit2 class="h-3.5 w-3.5" />
                  </button>
                  <button
                    class="w-7 h-7 rounded-md hover:bg-destructive hover:text-destructive-foreground hover:border-transparent border border-transparent flex items-center justify-center text-muted-foreground transition-all"
                    @click.stop="deleteSource(source)"
                    title="删除"
                  >
                    <Trash2 class="h-3.5 w-3.5" />
                  </button>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>
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

.scrollbar-hide {
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
</style>
