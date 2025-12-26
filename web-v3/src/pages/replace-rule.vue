<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import {
  Plus,
  Trash2,
  Upload,
  Download,
  Wand2,
  Edit2,
} from "lucide-vue-next";
import { replaceApi, type ReplaceRule } from "@/api/replace";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { useMessage } from "@/composables/useMessage";
import { useConfirm } from "@/composables/useConfirm";
import { useErrorHandler } from "@/composables/useErrorHandler";
import EditRule from "@/components/replace/EditRule.vue";
import ImportRule from "@/components/replace/ImportRule.vue";
import {
  PageHeader,
  PageToolbar,
  ManageModeBar,
  EmptyState,
  LoadingGrid,
} from "@/components/common";

const router = useRouter();
const { success, error, warning } = useMessage();
const { confirm } = useConfirm();
const { handleApiError, handlePromiseError } = useErrorHandler();

const rules = ref<ReplaceRule[]>([]);
const loading = ref(true);
const searchKeyword = ref("");
const showImport = ref(false);
const showEdit = ref(false);
const currentEditRule = ref<ReplaceRule | null>(null);
const selectedRules = ref<Set<string>>(new Set());
const isManageMode = ref(false);

const filteredRules = computed(() => {
  if (!searchKeyword.value) return rules.value;
  const keyword = searchKeyword.value.toLowerCase();
  return rules.value.filter(
    (s) =>
      s.name.toLowerCase().includes(keyword) ||
      s.pattern.toLowerCase().includes(keyword) ||
      s.scope.toLowerCase().includes(keyword) ||
      (s.group || "").toLowerCase().includes(keyword)
  );
});

const stats = computed(() => ({
  total: rules.value.length,
  enabled: rules.value.filter((r) => r.isEnabled).length,
  filtered: filteredRules.value.length,
  selected: selectedRules.value.size,
}));

async function loadRules() {
  loading.value = true;
  selectedRules.value.clear();
  try {
    const res = await replaceApi.getReplaceRules();
    if (res.isSuccess) {
      rules.value = res.data || [];
    } else {
      handleApiError(res, "加载规则失败");
    }
  } catch (e) {
    handlePromiseError(e, "加载规则失败");
  } finally {
    loading.value = false;
  }
}

async function toggleEnabled(rule: ReplaceRule) {
  // Optimistic update
  rule.isEnabled = !rule.isEnabled;
  try {
    const res = await replaceApi.saveReplaceRule(rule);
    if (!res.isSuccess) {
      // Revert
      rule.isEnabled = !rule.isEnabled;
      handleApiError(res, "更新失败");
    }
  } catch (e) {
    rule.isEnabled = !rule.isEnabled;
    handlePromiseError(e, "更新失败");
  }
}

function openEdit(rule?: ReplaceRule) {
  currentEditRule.value = rule || null;
  showEdit.value = true;
}

function toggleManageMode() {
  isManageMode.value = !isManageMode.value;
  if (!isManageMode.value) selectedRules.value.clear();
}

function selectAll() {
  if (selectedRules.value.size === filteredRules.value.length) {
    selectedRules.value.clear();
  } else {
    selectedRules.value = new Set(filteredRules.value.map((r) => r.name));
  }
}

function toggleSelect(rule: ReplaceRule) {
  if (selectedRules.value.has(rule.name)) {
    selectedRules.value.delete(rule.name);
  } else {
    selectedRules.value.add(rule.name);
  }
}

async function batchDelete() {
  if (selectedRules.value.size === 0) return;
  const result = await confirm({
    title: "确认删除",
    description: `确定删除选中的 ${selectedRules.value.size} 条规则吗？此操作不可恢复。`,
    variant: "destructive",
  });
  if (!result) return;

  const rulesToDelete = rules.value.filter((r) =>
    selectedRules.value.has(r.name)
  );
  let successCount = 0;
  for (const rule of rulesToDelete) {
    try {
      const res = await replaceApi.deleteReplaceRules([rule]);
      if (res.isSuccess) {
        successCount++;
        rules.value = rules.value.filter((r) => r.name !== rule.name);
      }
    } catch (e) {
      handlePromiseError(e, "删除失败", false);
    }
  }
  selectedRules.value = new Set();
  isManageMode.value = false;
  success(`删除了 ${successCount} 条规则`);
}

function exportRules() {
  const target =
    selectedRules.value.size > 0
      ? rules.value.filter((r) => selectedRules.value.has(r.name))
      : filteredRules.value;
  try {
    const data = JSON.stringify(target, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `replacerules_${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    success(`已导出 ${target.length} 条规则`);
  } catch (e) {
    handlePromiseError(e, "导出失败");
  }
}

async function deleteRule(rule: ReplaceRule) {
  const result = await confirm({
    title: "确认删除",
    description: `确定删除「${rule.name}」？此操作不可恢复。`,
    variant: "destructive",
  });
  if (!result) return;
  try {
    const res = await replaceApi.deleteReplaceRules([rule]);
    if (res.isSuccess) {
      rules.value = rules.value.filter((r) => r.name !== rule.name);
      selectedRules.value.delete(rule.name);
      success("删除成功");
    } else {
      handleApiError(res, "删除失败");
    }
  } catch (e) {
    handlePromiseError(e, "删除失败");
  }
}

function goBack() {
  router.push("/");
}

onMounted(() => {
  loadRules();
});
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
            onClick: () => (showImport = true),
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
          :key="rule.name"
          class="group relative bg-card hover:bg-muted/50 rounded-2xl border transition-all duration-200 cursor-pointer overflow-hidden"
          :class="{
            'ring-2 ring-primary ring-offset-2 ring-offset-background border-primary/50':
              selectedRules.has(rule.name) && isManageMode,
            'border-border/50 hover:border-border hover:shadow-md':
              !selectedRules.has(rule.name),
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
                      :checked="selectedRules.has(rule.name)"
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
                @update:checked="toggleEnabled(rule)"
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
      :selected-count="selectedRules.size"
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
