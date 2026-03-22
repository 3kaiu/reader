<script setup lang="ts">
import {
  Plus,
  Trash2,
  Upload,
  Download,
  Wand2,
  Edit2,
} from "lucide-vue-next";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { useReplaceRulePageView } from "@/composables/useReplaceRulePageView";
import EditRule from "@/components/replace/EditRule.vue";
import ImportRule from "@/components/replace/ImportRule.vue";
import {
  PageHeader,
  PageToolbar,
  ManageModeBar,
  EmptyState,
  LoadingGrid,
} from "@/components/common";
import { getReplaceRuleKey } from "@/utils/replaceRules";

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
      <!-- 页面头部 -->
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

      <!-- 页面工具栏 -->
      <PageToolbar
        title="全部规则"
        :icon="Wand2"
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

      <!-- 加载状态 -->
      <LoadingGrid v-if="loading" />

      <!-- 空状态 -->
      <EmptyState
        v-else-if="filteredRules.length === 0"
        :icon="Wand2"
        :title="searchKeyword ? '未找到匹配的规则' : '暂无规则'"
        :description="
          searchKeyword
            ? '尝试更换搜索关键词'
            : '创建替换规则来优化阅读体验'
        "
        :actions="[
          {
            label: '新增规则',
            icon: Plus,
            onClick: () => openEdit(),
          },
          ...(searchKeyword
            ? [
                {
                  label: '查看全部',
                  onClick: () => (searchKeyword = ''),
                  variant: 'outline' as const,
                },
              ]
            : []),
        ]"
      />

      <!-- 规则列表 (网格布局) -->
      <div
        v-else
        class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500"
      >
        <div
          v-for="rule in filteredRules"
          :key="getReplaceRuleKey(rule)"
          class="group relative bg-card hover:bg-muted/50 rounded-2xl border transition-all duration-200 cursor-pointer overflow-hidden"
          :class="{
            'ring-2 ring-primary ring-offset-2 ring-offset-background border-primary/50':
              isRuleSelected(rule) && isManageMode,
            'border-border/50 hover:border-border hover:shadow-md':
              !isRuleSelected(rule),
            'opacity-50': !rule.isEnabled && !isManageMode,
          }"
          @click="isManageMode ? toggleSelect(rule) : openEdit(rule)"
        >
          <div class="p-4 h-full flex flex-col gap-3">
            <!-- 顶部: 勾选框/图标 + 标题 + 操作 -->
            <div class="flex items-start justify-between gap-3">
              <div class="flex items-start gap-3 min-w-0 flex-1">
                <!-- 勾选框 / 图标 -->
                <div class="shrink-0 relative mt-0.5">
                  <div
                    v-if="isManageMode"
                    class="w-5 h-5 flex items-center justify-center"
                    @click.stop="toggleSelect(rule)"
                  >
                    <Checkbox
                      :checked="isRuleSelected(rule)"
                      @update:checked="toggleSelect(rule)"
                      @click.stop
                      class="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                    />
                  </div>
                  <div
                    v-else
                    class="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                    :class="
                      rule.isEnabled
                        ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
                        : 'bg-muted/50 text-muted-foreground'
                    "
                  >
                    <Wand2 class="h-4 w-4" />
                  </div>
                </div>

                <!-- 标题 & 标签 -->
                <div class="flex-1 min-w-0">
                  <h3
                    class="font-semibold text-sm leading-tight mb-1 text-foreground line-clamp-2"
                  >
                    {{ rule.name }}
                  </h3>
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <Badge
                      v-if="rule.group"
                      variant="secondary"
                      class="rounded-md px-2 py-0.5 text-xs bg-secondary/60 text-muted-foreground font-normal truncate max-w-[100px]"
                    >
                      {{ rule.group }}
                    </Badge>
                    <span
                      class="text-xs text-muted-foreground/60 bg-muted/50 px-1.5 py-0.5 rounded"
                    >
                      {{ rule.scope || "全局" }}
                    </span>
                    <Badge
                      v-if="rule.isRegex"
                      variant="outline"
                      class="rounded-md px-1.5 py-0.5 text-[10px] border-blue-500/20 text-blue-600 dark:text-blue-400 bg-blue-500/10"
                    >
                      正则
                    </Badge>
                  </div>
                </div>
              </div>

              <!-- 操作按钮 (悬浮显示) -->
              <div
                class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                v-if="!isManageMode"
              >
                <button
                  class="w-7 h-7 rounded-md hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                  @click.stop="openEdit(rule)"
                  title="编辑"
                  aria-label="编辑"
                >
                  <Edit2 class="h-3.5 w-3.5" />
                </button>
                <button
                  class="w-7 h-7 rounded-md hover:bg-destructive/10 hover:text-destructive flex items-center justify-center text-muted-foreground transition-colors"
                  @click.stop="deleteRule(rule)"
                  title="删除"
                  aria-label="删除"
                >
                  <Trash2 class="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <!-- 中间: 替换规则预览 -->
            <div
              class="flex-1 space-y-2 pt-2 border-t border-border/40 min-h-[60px]"
            >
              <div class="flex items-center gap-2 text-xs">
                <code
                  class="flex-1 bg-muted/80 px-2 py-1.5 rounded text-[10px] truncate font-mono text-foreground/80"
                  :title="rule.pattern"
                >
                  {{ rule.pattern }}
                </code>
                <span class="text-muted-foreground/60 shrink-0">→</span>
                <code
                  class="flex-1 bg-muted/80 px-2 py-1.5 rounded text-[10px] truncate font-mono text-foreground/80"
                  :title="rule.replacement || '删除'"
                >
                  {{ rule.replacement || "删除" }}
                </code>
              </div>
            </div>

            <!-- 底部: 开关 -->
            <div
              class="flex items-center justify-between pt-2 border-t border-border/40"
            >
              <div class="text-xs text-muted-foreground/60">
                {{ rule.isEnabled ? "已启用" : "已禁用" }}
              </div>

              <!-- 快速开关 -->
              <Switch
                v-if="!isManageMode"
                :checked="rule.isEnabled"
                @update:checked="(enabled: boolean) => toggleEnabled(rule, enabled)"
                @click.stop
                class="data-[state=checked]:bg-primary"
              />
            </div>
          </div>
        </div>
      </div>
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
