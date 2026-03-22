<script setup lang="ts">
/**
 * AI 映射规则管理页面
 * 管理映射规则与分析历史
 */
import {
  Brain,
  Plus,
  Edit,
  Trash2,
  Save,
  X,
  History,
  Filter,
  Upload,
  Download,
} from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useAiAnalysisSettingsView } from "@/composables/useAiAnalysisSettingsView";
import {
  AI_MAPPING_FILTER_OPTIONS,
  AI_MAPPING_TYPE_CONFIG,
} from "@/constants/aiAnalysis";
import { PageHeader, EmptyState } from "@/components/common";

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
} = useAiAnalysisSettingsView();
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

      <!-- 页面工具栏 -->
      <div class="flex items-center gap-3 mb-6">
        <div class="flex items-center gap-2 shrink-0">
          <Brain class="w-4 h-4 text-primary" />
          <h2
            class="text-sm font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2"
          >
            全部规则
            <span class="text-xs font-normal text-muted-foreground/60 normal-case">
              ({{ stats.total }})
            </span>
          </h2>
        </div>

        <div class="flex-1"></div>

        <!-- 统计信息 -->
        <div class="flex items-center gap-3 shrink-0">
          <div
            class="flex items-center gap-2 text-sm text-muted-foreground bg-muted px-3 py-1.5 rounded-md border border-border"
          >
            <span
              class="w-1.5 h-1.5 rounded-full"
              style="background-color: #22c55e"
            ></span>
            <span>启用 {{ stats.enabled }}</span>
          </div>
        </div>

        <!-- 类型筛选 -->
        <div class="relative">
          <select
            v-model="filterType"
            class="pl-9 pr-4 h-9 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option
              v-for="option in AI_MAPPING_FILTER_OPTIONS"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
          <Filter
            class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
          />
        </div>
      </div>

      <div class="mb-6 rounded-xl border border-border/50 bg-card px-4 py-3 text-xs text-muted-foreground">
        当前页面仅管理 AI 映射规则与分析历史。导入导出使用精简 JSON：`original`、`target`、`type`，可选 `id`、`confidence`、`enabled`。
      </div>

      <!-- 空状态 -->
      <EmptyState
        v-if="displayMappings.length === 0"
        :icon="Brain"
        :title="searchKeyword ? '未找到匹配的规则' : '暂无映射规则'"
        :description="
          searchKeyword
            ? '尝试更换搜索关键词'
            : '添加映射规则以帮助 AI 更好地识别文本中的映射关系'
        "
        :actions="[
          searchKeyword
            ? {
                label: '查看全部',
                onClick: () => (searchKeyword = ''),
                variant: 'outline',
              }
            : {
                label: '添加映射规则',
                icon: Plus,
                onClick: () => openAddDialog(),
              },
        ]"
      />

      <!-- 映射规则列表 (网格布局) -->
      <div
        v-else
        class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500 mb-8"
      >
        <div
          v-for="mapping in displayMappings"
          :key="mapping.id"
          class="group relative bg-card hover:bg-muted/50 rounded-2xl border transition-all duration-200 overflow-hidden"
          :class="{
            'border-border/50 hover:border-border hover:shadow-md': mapping.enabled,
            'opacity-50 border-border/30': !mapping.enabled,
          }"
        >
          <div class="p-4 h-full flex flex-col gap-3">
            <!-- 顶部: 图标 + 标题 -->
            <div class="flex items-start gap-3">
              <div
                :class="[
                  'w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
                  AI_MAPPING_TYPE_CONFIG[mapping.type]?.color || 'bg-gray-500/10 text-gray-600',
                ]"
              >
                <component
                  :is="AI_MAPPING_TYPE_CONFIG[mapping.type]?.icon || AI_MAPPING_TYPE_CONFIG.other.icon"
                  class="h-5 w-5"
                />
              </div>

              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1 mb-1">
                  <span class="font-semibold text-sm truncate">{{
                    mapping.original
                  }}</span>
                  <span class="text-muted-foreground text-xs">→</span>
                  <span class="font-semibold text-sm text-primary truncate">{{
                    mapping.target
                  }}</span>
                </div>
                <Badge
                  :class="AI_MAPPING_TYPE_CONFIG[mapping.type]?.color || 'bg-gray-500/10 text-gray-600'"
                  class="text-xs"
                >
                  {{ AI_MAPPING_TYPE_CONFIG[mapping.type]?.label || '其他' }}
                </Badge>
              </div>
            </div>

            <!-- 信息 -->
            <div class="flex items-center justify-between text-xs text-muted-foreground">
              <span>置信度: {{ Math.round(mapping.confidence * 100) }}%</span>
              <span v-if="mapping.usageCount !== undefined">
                使用: {{ mapping.usageCount }}
              </span>
            </div>

            <!-- 操作按钮 -->
            <div class="flex items-center gap-1.5 pt-2 border-t border-border/50">
              <Switch
                :checked="mapping.enabled"
                @update:checked="(enabled: boolean) => toggleMapping(mapping, enabled)"
                class="flex-1"
              />
              <Button
                variant="ghost"
                size="sm"
                class="h-7 px-2"
                @click="openAddDialog(mapping)"
                title="编辑"
              >
                <Edit class="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                class="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                @click="deleteMapping(mapping)"
                title="删除"
              >
                <Trash2 class="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <!-- 分析历史 -->
      <div class="mb-6">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2">
            <History class="h-4 w-4 text-primary" />
            <h3 class="font-semibold text-sm">分析历史</h3>
            <Badge variant="secondary" class="text-xs">
              {{ history.length }}
            </Badge>
          </div>
          <Button
            v-if="history.length > 0"
            variant="ghost"
            size="sm"
            class="gap-2"
            @click="clearHistory"
          >
            <Trash2 class="h-4 w-4" />
            清除
          </Button>
        </div>

        <div
          v-if="history.length === 0"
          class="p-8 text-center text-sm text-muted-foreground bg-muted/30 rounded-xl"
        >
          暂无分析历史
        </div>

        <div v-else class="space-y-2">
          <div
            v-for="item in history.slice(0, 5)"
            :key="item.id"
            class="p-3 rounded-xl border border-border/50 bg-card hover:bg-muted/30 transition-colors"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="flex-1 min-w-0">
                <div class="font-medium text-sm mb-1 truncate">
                  {{ item.bookTitle }}
                </div>
                <div class="text-xs text-muted-foreground mb-2">
                  {{ item.chapterTitle }}
                </div>
                <div class="flex items-center gap-1.5 flex-wrap">
                  <Badge
                    v-for="mapping in item.mappings.slice(0, 4)"
                    :key="mapping.id"
                    variant="outline"
                    class="text-xs"
                  >
                    {{ mapping.original }} → {{ mapping.target }}
                  </Badge>
                  <span
                    v-if="item.mappings.length > 4"
                    class="text-xs text-muted-foreground"
                  >
                    +{{ item.mappings.length - 4 }}
                  </span>
                </div>
              </div>
              <div class="text-xs text-muted-foreground shrink-0">
                {{ new Date(item.analyzedAt).toLocaleDateString() }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- 添加/编辑对话框 -->
    <div
      v-if="showAddDialog"
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      @click.self="closeAddDialog"
    >
      <div
        class="w-full max-w-md rounded-t-2xl sm:rounded-2xl border-t sm:border border-border bg-card shadow-xl p-6 space-y-4 animate-in slide-in-from-bottom sm:slide-in-from-top max-h-[90vh] overflow-y-auto"
        @click.stop
      >
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold">
            {{ editingRule ? "编辑映射规则" : "添加映射规则" }}
          </h3>
          <button
            @click="closeAddDialog"
            class="p-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <X class="h-4 w-4" />
          </button>
        </div>

        <div class="space-y-4">
          <div>
            <label class="text-sm font-medium mb-2 block">原文</label>
            <input
              v-model="newRule.original"
              type="text"
              placeholder="例如：周洁仑"
              class="w-full px-4 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label class="text-sm font-medium mb-2 block">目标名称</label>
            <input
              v-model="newRule.target"
              type="text"
              placeholder="例如：周杰伦"
              class="w-full px-4 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label class="text-sm font-medium mb-2 block">类型</label>
            <select
              v-model="newRule.type"
              class="w-full px-4 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="person">人物</option>
              <option value="company">公司</option>
              <option value="department">部门</option>
              <option value="location">地点</option>
              <option value="other">其他</option>
            </select>
          </div>

          <div>
            <label class="text-sm font-medium mb-2 block">
              置信度: {{ Math.round((newRule.confidence ?? 0.8) * 100) }}%
            </label>
            <input
              v-model.number="newRule.confidence"
              type="range"
              min="0"
              max="1"
              step="0.1"
              class="w-full"
            />
          </div>

          <div class="flex items-center justify-between">
            <span class="text-sm font-medium">启用</span>
            <Switch v-model:checked="newRule.enabled" />
          </div>
        </div>

        <div class="flex items-center gap-3 pt-4">
          <Button @click="saveMapping" class="flex-1 gap-2">
            <Save class="h-4 w-4" />
            保存
          </Button>
          <Button
            variant="outline"
            @click="closeAddDialog"
            class="flex-1"
          >
            取消
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.h-safe-top {
  height: env(safe-area-inset-top, 0px);
}
</style>
