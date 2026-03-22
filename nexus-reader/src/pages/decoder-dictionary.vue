<script setup lang="ts">
/**
 * 词典管理页面
 * 查看、编辑、导入导出解密词典
 */
import {
  Plus,
  Trash2,
  Upload,
  Download,
  BookOpen,
  Edit2,
  Filter,
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { useDecoderDictionaryPageView } from '@/composables/useDecoderDictionaryPageView'
import {
  DECODER_CATEGORY_CONFIG,
  DECODER_CATEGORY_OPTIONS,
  DECODER_LEVEL_CONFIG,
  DECODER_LEVEL_OPTIONS,
} from '@/constants/decoderDictionary'
import {
  getDecoderEntryScopeLabel as getEntryScopeLabel,
} from '@/utils/decoderDictionary'
import {
  PageHeader,
  PageToolbar,
  ManageModeBar,
  EmptyState,
  LoadingGrid,
} from '@/components/common'

const {
  searchKeyword,
  filterCategory,
  filterLevel,
  entries,
  filteredEntries,
  loading,
  isManageMode,
  selectedEntries,
  selectedCount,
  toggleSelect,
  selectAll,
  toggleManageMode,
  stats,
  categoryStats,
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

      <!-- 过滤器 -->
      <div class="flex items-center gap-3 mb-4 flex-wrap">
        <div class="flex items-center gap-2">
          <Filter class="w-4 h-4 text-muted-foreground" />
          <span class="text-sm text-muted-foreground">筛选:</span>
        </div>

        <!-- 类别过滤 -->
        <select
          v-model="filterCategory"
          class="px-3 py-1.5 text-sm bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="all">全部类别</option>
          <option
            v-for="option in DECODER_CATEGORY_OPTIONS"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>

        <!-- 层级过滤 -->
        <select
          v-model="filterLevel"
          class="px-3 py-1.5 text-sm bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="all">全部层级</option>
          <option
            v-for="option in DECODER_LEVEL_OPTIONS"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>

        <span class="text-xs text-muted-foreground">
          导入导出使用精简 JSON：`original`、`real`、`category`，可选 `aliases`、`description`、`level`、`bookId`、`bookType`
        </span>
      </div>

      <!-- 页面工具栏 -->
      <PageToolbar
        title="解密词典"
        :icon="BookOpen"
        :count="stats.filtered"
        :stats="[
          { label: '人物', value: stats.byCategory.person, color: '#3b82f6' },
          { label: '公司', value: stats.byCategory.company, color: '#8b5cf6' },
          { label: '地点', value: stats.byCategory.place, color: '#22c55e' },
        ]"
        :is-manage-mode="isManageMode"
        @toggle-manage="toggleManageMode"
      />

      <!-- 加载状态 -->
      <LoadingGrid v-if="loading" />

      <!-- 空状态 -->
      <EmptyState
        v-else-if="filteredEntries.length === 0"
        :icon="BookOpen"
        :title="searchKeyword ? '未找到匹配的词条' : '暂无词条'"
        :description="searchKeyword ? '尝试更换搜索关键词' : '添加词条来帮助解密加密内容'"
        :actions="[
          {
            label: '新增词条',
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

      <!-- 词条列表 -->
      <div
        v-else
        class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500"
      >
        <div
          v-for="entry in filteredEntries"
          :key="entry.id"
          class="group relative bg-card hover:bg-muted/50 rounded-2xl border transition-all duration-200 cursor-pointer overflow-hidden"
          :class="{
            'ring-2 ring-primary ring-offset-2 ring-offset-background border-primary/50':
              selectedEntries.has(entry.id) && isManageMode,
            'border-border/50 hover:border-border hover:shadow-md':
              !selectedEntries.has(entry.id),
          }"
          @click="isManageMode ? toggleSelect(entry) : openEdit(entry)"
        >
          <div class="p-4 h-full flex flex-col gap-3">
            <!-- 顶部 -->
            <div class="flex items-start justify-between gap-3">
              <div class="flex items-start gap-3 min-w-0 flex-1">
                <!-- 勾选框 / 图标 -->
                <div class="shrink-0 relative mt-0.5">
                  <div
                    v-if="isManageMode"
                    class="w-5 h-5 flex items-center justify-center"
                    @click.stop="toggleSelect(entry)"
                  >
                    <Checkbox
                      :checked="selectedEntries.has(entry.id)"
                      @update:checked="toggleSelect(entry)"
                      @click.stop
                    />
                  </div>
                  <div
                    v-else
                    class="w-8 h-8 rounded-lg flex items-center justify-center bg-primary/10 text-primary"
                  >
                    <component
                      :is="DECODER_CATEGORY_CONFIG[entry.category].icon"
                      class="h-4 w-4"
                    />
                  </div>
                </div>

                <!-- 标题 -->
                <div class="flex-1 min-w-0">
                  <h3 class="font-semibold text-sm leading-tight mb-1 text-foreground">
                    {{ entry.original }}
                  </h3>
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <Badge
                      variant="secondary"
                      class="rounded-md px-2 py-0.5 text-xs"
                      :class="DECODER_LEVEL_CONFIG[entry.level].color"
                    >
                      {{ DECODER_LEVEL_CONFIG[entry.level].label }}
                    </Badge>
                    <span class="text-xs text-muted-foreground">
                      {{ getEntryScopeLabel(entry) }}
                    </span>
                    <span class="text-xs text-muted-foreground">
                      {{ DECODER_CATEGORY_CONFIG[entry.category].label }}
                    </span>
                  </div>
                </div>
              </div>

              <!-- 操作按钮 -->
              <div
                v-if="!isManageMode"
                class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              >
                <button
                  class="w-7 h-7 rounded-md hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                  @click.stop="openEdit(entry)"
                  title="编辑"
                >
                  <Edit2 class="h-3.5 w-3.5" />
                </button>
                <button
                  class="w-7 h-7 rounded-md hover:bg-destructive/10 hover:text-destructive flex items-center justify-center text-muted-foreground transition-colors"
                  @click.stop="deleteEntry(entry)"
                  title="删除"
                >
                  <Trash2 class="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <!-- 中间: 映射关系 -->
            <div class="flex-1 pt-2 border-t border-border/40">
              <div class="flex items-center gap-2 text-sm">
                <span class="text-muted-foreground">{{ entry.original }}</span>
                <span class="text-muted-foreground/60">→</span>
                <span class="font-medium text-primary">{{ entry.real }}</span>
              </div>
              <p v-if="entry.description" class="text-xs text-muted-foreground mt-1 line-clamp-2">
                {{ entry.description }}
              </p>
            </div>

            <!-- 底部: 置信度 -->
            <div class="flex items-center justify-between pt-2 border-t border-border/40">
              <div class="text-xs text-muted-foreground">
                置信度: {{ entry.confidence }}%
              </div>
              <div class="text-xs text-muted-foreground">
                确认: {{ entry.confirmCount }} 次
              </div>
            </div>
          </div>
        </div>
      </div>
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

    <!-- 编辑弹窗 -->
    <Teleport to="body">
      <div
        v-if="showEdit"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        @click.self="closeEdit"
      >
        <div class="bg-background rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
          <h2 class="text-lg font-semibold mb-4">
            {{ currentEditEntry ? '编辑词条' : '新增词条' }}
          </h2>

          <div class="space-y-4">
            <div class="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              {{
                currentEditEntry
                  ? `当前作用域：${getEntryScopeLabel(currentEditEntry)}`
                  : '新建词条默认保存到公共词典；当前页面不提供书籍级或分类级新建入口。'
              }}
            </div>

            <!-- 加密词 -->
            <div>
              <label class="text-sm text-muted-foreground mb-1 block">加密词</label>
              <input
                v-model="editForm.original"
                type="text"
                class="w-full px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="如: 马芸"
              />
            </div>

            <!-- 真实指代 -->
            <div>
              <label class="text-sm text-muted-foreground mb-1 block">真实指代</label>
              <input
                v-model="editForm.real"
                type="text"
                class="w-full px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="如: 马云"
              />
            </div>

            <!-- 类别 -->
            <div>
              <label class="text-sm text-muted-foreground mb-1 block">类别</label>
              <select
                v-model="editForm.category"
                class="w-full px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option
                  v-for="option in DECODER_CATEGORY_OPTIONS"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </div>

            <!-- 描述 -->
            <div>
              <label class="text-sm text-muted-foreground mb-1 block">描述 (可选)</label>
              <input
                v-model="editForm.description"
                type="text"
                class="w-full px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="如: 阿里巴巴创始人"
              />
            </div>

            <!-- 别名 -->
            <div>
              <label class="text-sm text-muted-foreground mb-1 block">别名 (可选，逗号分隔)</label>
              <input
                v-model="editForm.aliases"
                type="text"
                class="w-full px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="如: 杰克马, 风清扬"
              />
            </div>
          </div>

          <!-- 按钮 -->
          <div class="flex gap-3 mt-6">
            <Button variant="outline" class="flex-1" @click="closeEdit">
              取消
            </Button>
            <Button class="flex-1" @click="saveEntry">
              保存
            </Button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.h-safe-top {
  height: env(safe-area-inset-top, 0px);
}
</style>
