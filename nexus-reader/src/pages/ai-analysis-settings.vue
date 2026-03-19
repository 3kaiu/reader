<script setup lang="ts">
/**
 * AI 映射规则管理页面
 * 管理映射规则与分析历史
 */
import { ref, onMounted, computed, useTemplateRef } from "vue";
import { useRouter } from "vue-router";
import {
  Brain,
  Plus,
  Edit,
  Trash2,
  Save,
  X,
  History,
  AlertCircle,
  User,
  Building2,
  MapPin,
  Filter,
  Upload,
  Download,
} from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useMessage } from "@/composables/useMessage";
import { useConfirm } from "@/composables/useConfirm";
import { useErrorHandler } from "@/composables/useErrorHandler";
import { aiApi, type AiMappingRule, type AiAnalysisHistory } from "@/api/ai";
import { PageHeader, EmptyState } from "@/components/common";

type AiMappingTransferRule = Pick<
  AiMappingRule,
  "id" | "original" | "target" | "type" | "confidence" | "enabled"
>;

const router = useRouter();
const { success, error } = useMessage();
const { confirm } = useConfirm();
const { handlePromiseError } = useErrorHandler();

// 状态
const isLoading = ref(false);
const mappings = ref<AiMappingRule[]>([]);
const history = ref<AiAnalysisHistory[]>([]);
const searchKeyword = ref("");
const importInputRef = useTemplateRef<HTMLInputElement>("importInput");
const filterType = ref<
  "all" | "person" | "company" | "department" | "location" | "other"
>("all");
const showAddDialog = ref(false);
const editingRule = ref<AiMappingRule | null>(null);
const newRule = ref<Partial<AiMappingRule>>({
  original: "",
  target: "",
  type: "person",
  confidence: 0.8,
  enabled: true,
});

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeConfidence(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0.8;
  }

  return Math.min(1, Math.max(0, value));
}

function normalizeMappingType(value: unknown): string {
  const type = normalizeText(value);
  return type || "person";
}

function toTransferRule(rule: AiMappingRule): AiMappingTransferRule {
  return {
    id: rule.id,
    original: rule.original,
    target: rule.target,
    type: rule.type,
    confidence: rule.confidence,
    enabled: rule.enabled,
  };
}

function normalizeImportRule(value: unknown): AiMappingRule | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = value as Partial<AiMappingTransferRule> &
    Partial<Pick<AiMappingRule, "createdAt" | "usageCount">>;
  const original = normalizeText(raw.original);
  const target = normalizeText(raw.target);

  if (!original || !target) {
    return null;
  }

  return {
    id: normalizeText(raw.id) || `mapping_${Date.now()}_${crypto.randomUUID()}`,
    original,
    target,
    type: normalizeMappingType(raw.type),
    confidence: normalizeConfidence(raw.confidence),
    enabled: raw.enabled !== false,
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : Date.now(),
    usageCount: typeof raw.usageCount === "number" ? raw.usageCount : undefined,
  };
}

// 从 API 加载规则和历史
async function loadData() {
  isLoading.value = true;
  try {
    // 1. 从 API 加载映射规则
    const mappingRes = await aiApi.getMappings();
    if (mappingRes.isSuccess && Array.isArray(mappingRes.data)) {
      mappings.value = mappingRes.data;
    }

    // 2. 从 API 加载历史
    const historyRes = await aiApi.getHistory();
    if (historyRes.isSuccess && Array.isArray(historyRes.data)) {
      history.value = historyRes.data;
    }
  } catch (e) {
    handlePromiseError(e, "加载数据失败");
  } finally {
    isLoading.value = false;
  }
}

// 计算显示的映射规则
const displayMappings = computed(() => {
  let list = Array.isArray(mappings.value) ? mappings.value : [];

  if (filterType.value !== "all") {
    list = list.filter((m) => m.type === filterType.value);
  }

  if (searchKeyword.value.trim()) {
    const query = searchKeyword.value.toLowerCase();
    list = list.filter(
      (m) =>
        m.original.toLowerCase().includes(query) ||
        m.target.toLowerCase().includes(query)
    );
  }

  return list;
});

// 统计信息
const stats = computed(() => {
  const list = Array.isArray(mappings.value) ? mappings.value : [];
  return {
    total: list.length,
    enabled: list.filter((m) => m.enabled).length,
  };
});

// 类型配置
const typeConfig = {
  person: {
    icon: User,
    label: "人物",
    color: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  company: {
    icon: Building2,
    label: "公司",
    color: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  },
  department: {
    icon: Building2,
    label: "部门",
    color: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
  },
  location: {
    icon: MapPin,
    label: "地点",
    color: "bg-green-500/10 text-green-600 dark:text-green-400",
  },
  other: {
    icon: AlertCircle,
    label: "其他",
    color: "bg-gray-500/10 text-gray-600 dark:text-gray-400",
  },
};

// 添加/编辑映射规则
function openAddDialog(rule?: AiMappingRule) {
  if (rule) {
    editingRule.value = rule;
    newRule.value = { ...rule };
  } else {
    editingRule.value = null;
    newRule.value = {
      original: "",
      target: "",
      type: "person",
      confidence: 0.8,
      enabled: true,
    };
  }
  showAddDialog.value = true;
}

// 保存映射规则
async function saveMapping() {
  const original = normalizeText(newRule.value.original);
  const target = normalizeText(newRule.value.target);

  if (!original || !target) {
    error("请填写完整信息");
    return;
  }

  const ruleToSave: AiMappingRule = {
    id: editingRule.value?.id || `mapping_${Date.now()}`,
    original,
    target,
    type: normalizeMappingType(newRule.value.type),
    confidence: normalizeConfidence(newRule.value.confidence),
    enabled: newRule.value.enabled ?? true,
    createdAt: editingRule.value?.createdAt || Date.now(),
    usageCount: editingRule.value?.usageCount || 0,
  };

  try {
    const res = await aiApi.saveMapping(ruleToSave);
    if (res.isSuccess) {
      const mappingRes = await aiApi.getMappings();
      if (mappingRes.isSuccess) {
        mappings.value = mappingRes.data;
      }
      success(editingRule.value ? "映射规则已更新" : "映射规则已添加");
      showAddDialog.value = false;
      editingRule.value = null;
    } else {
      error("保存失败: " + res.errorMsg);
    }
  } catch (e) {
    handlePromiseError(e, "保存失败");
  }
}

// 删除映射规则
async function deleteMapping(rule: AiMappingRule) {
  const result = await confirm({
    title: "确认删除",
    description: `确定要删除映射规则 "${rule.original} → ${rule.target}" 吗？`,
  });

  if (!result) return;

  try {
    const res = await aiApi.deleteMapping(rule.id);
    if (res.isSuccess) {
      mappings.value = mappings.value.filter((m) => m.id !== rule.id);
      success("映射规则已删除");
    }
  } catch (e) {
    handlePromiseError(e, "删除失败");
  }
}

// 切换规则启用状态
async function toggleMapping(rule: AiMappingRule) {
  const oldState = rule.enabled;
  rule.enabled = !rule.enabled;
  try {
    const res = await aiApi.saveMapping(rule);
    if (!res.isSuccess) {
      rule.enabled = oldState; // 回滚
      error("更新失败");
    }
  } catch (e) {
    rule.enabled = oldState;
    handlePromiseError(e, "更新失败");
  }
}

// 导出映射规则
function exportMappings() {
  try {
    const data = mappings.value.map(toTransferRule);
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-analysis-mappings_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    success("映射规则导出成功");
  } catch (e) {
    handlePromiseError(e, "导出失败");
  }
}

// 导入映射规则
async function importMappings(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(text) as unknown;
    const list =
      Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === "object" && Array.isArray((parsed as any).mappings)
          ? (parsed as any).mappings
          : null;

    if (!list) {
      error("文件格式不正确");
      return;
    }

    const rules = list
      .map((item) => normalizeImportRule(item))
      .filter((item): item is AiMappingRule => item !== null);

    if (rules.length === 0) {
      error("未找到有效的映射规则");
      return;
    }

    const skipped = list.length - rules.length;
    for (const rule of rules) {
      await aiApi.saveMapping(rule);
    }
    const mappingRes = await aiApi.getMappings();
    if (mappingRes.isSuccess) mappings.value = mappingRes.data;
    success(
      skipped > 0
        ? `映射规则导入成功，导入 ${rules.length} 条，跳过 ${skipped} 条无效数据`
        : `映射规则导入成功，共 ${rules.length} 条`
    );
  } catch (e) {
    handlePromiseError(e, "导入失败");
  } finally {
    input.value = "";
  }
}

function triggerImport() {
  importInputRef.value?.click();
}

// 清除历史记录
async function clearHistory() {
  const result = await confirm({
    title: "确认清除",
    description: "确定要清除所有分析历史记录吗？此操作不可恢复。",
  });

  if (!result) return;

  try {
    const res = await aiApi.clearHistory();
    if (res.isSuccess) {
      history.value = [];
      success("历史记录已清除");
    }
  } catch (e) {
    handlePromiseError(e, "清除失败");
  }
}

onMounted(() => {
  loadData();
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
        @back="router.push('/settings')"
      />

      <input
        ref="importInput"
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
            <option value="all">全部类型</option>
            <option value="person">人物</option>
            <option value="company">公司</option>
            <option value="department">部门</option>
            <option value="location">地点</option>
            <option value="other">其他</option>
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
                  typeConfig[mapping.type as keyof typeof typeConfig]?.color || 'bg-gray-500/10 text-gray-600',
                ]"
              >
                <component
                  :is="typeConfig[mapping.type as keyof typeof typeConfig]?.icon || AlertCircle"
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
                  :class="typeConfig[mapping.type as keyof typeof typeConfig]?.color || 'bg-gray-500/10 text-gray-600'"
                  class="text-xs"
                >
                  {{ typeConfig[mapping.type as keyof typeof typeConfig]?.label || '其他' }}
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
                @update:checked="toggleMapping(mapping)"
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
      @click.self="showAddDialog = false"
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
            @click="showAddDialog = false"
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
            @click="showAddDialog = false"
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
