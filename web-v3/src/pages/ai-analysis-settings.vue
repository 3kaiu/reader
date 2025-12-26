<script setup lang="ts">
/**
 * 网文分析助手管理页面
 * 管理谐音映射规则、分析历史、配置等
 */
import { ref, onMounted, computed } from "vue";
import { useRouter } from "vue-router";
import {
  Brain,
  Search,
  Plus,
  Edit,
  Trash2,
  Save,
  X,
  History,
  Settings,
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
import { PageHeader, PageToolbar, EmptyState } from "@/components/common";

const router = useRouter();
const { success, error } = useMessage();
const { confirm } = useConfirm();
const { handlePromiseError } = useErrorHandler();

// 映射规则类型
interface MappingRule {
  id: string;
  original: string;
  target: string;
  type: "person" | "company" | "department" | "location" | "other";
  confidence: number;
  enabled: boolean;
  createdAt: number;
  usageCount?: number;
}

// 分析历史类型
interface AnalysisHistory {
  id: string;
  bookTitle: string;
  chapterTitle: string;
  mappings: MappingRule[];
  analyzedAt: number;
}

// 状态
const isLoading = ref(false);
const mappings = ref<MappingRule[]>([]);
const history = ref<AnalysisHistory[]>([]);
const searchKeyword = ref("");
const filterType = ref<
  "all" | "person" | "company" | "department" | "location" | "other"
>("all");
const showAddDialog = ref(false);
const editingRule = ref<MappingRule | null>(null);
const newRule = ref<Partial<MappingRule>>({
  original: "",
  target: "",
  type: "person",
  confidence: 0.8,
  enabled: true,
});

// 配置
const autoAnalysis = ref(true);
const showMappingsInReader = ref(true);
const highlightMappings = ref(true);

// 从 LocalStorage 加载配置和规则
function loadSettings() {
  try {
    const savedMappings = localStorage.getItem("ai-analysis-mappings");
    if (savedMappings) {
      mappings.value = JSON.parse(savedMappings);
    }

    const savedHistory = localStorage.getItem("ai-analysis-history");
    if (savedHistory) {
      history.value = JSON.parse(savedHistory).slice(0, 50);
    }

    const savedConfig = localStorage.getItem("ai-analysis-config");
    if (savedConfig) {
      const config = JSON.parse(savedConfig);
      autoAnalysis.value = config.autoAnalysis ?? true;
      showMappingsInReader.value = config.showMappingsInReader ?? true;
      highlightMappings.value = config.highlightMappings ?? true;
    }
  } catch (e) {
    handlePromiseError(e, "加载设置失败");
  }
}

// 保存设置
function saveSettings() {
  try {
    localStorage.setItem("ai-analysis-mappings", JSON.stringify(mappings.value));
    localStorage.setItem("ai-analysis-history", JSON.stringify(history.value));
    localStorage.setItem(
      "ai-analysis-config",
      JSON.stringify({
        autoAnalysis: autoAnalysis.value,
        showMappingsInReader: showMappingsInReader.value,
        highlightMappings: highlightMappings.value,
      })
    );
  } catch (e) {
    handlePromiseError(e, "保存设置失败");
  }
}

// 计算显示的映射规则
const displayMappings = computed(() => {
  let list = mappings.value;

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
const stats = computed(() => ({
  total: mappings.value.length,
  enabled: mappings.value.filter((m) => m.enabled).length,
}));

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
function openAddDialog(rule?: MappingRule) {
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
function saveMapping() {
  if (!newRule.value.original?.trim() || !newRule.value.target?.trim()) {
    error("请填写完整信息");
    return;
  }

  if (editingRule.value) {
    const index = mappings.value.findIndex(
      (m) => m.id === editingRule.value!.id
    );
    if (index !== -1) {
      mappings.value[index] = {
        ...mappings.value[index],
        ...newRule.value,
        original: newRule.value.original!,
        target: newRule.value.target!,
        type: newRule.value.type!,
      };
    }
    success("映射规则已更新");
  } else {
    const rule: MappingRule = {
      id: `mapping_${Date.now()}`,
      original: newRule.value.original!,
      target: newRule.value.target!,
      type: newRule.value.type!,
      confidence: newRule.value.confidence ?? 0.8,
      enabled: newRule.value.enabled ?? true,
      createdAt: Date.now(),
      usageCount: 0,
    };
    mappings.value.push(rule);
    success("映射规则已添加");
  }

  saveSettings();
  showAddDialog.value = false;
  editingRule.value = null;
}

// 删除映射规则
async function deleteMapping(rule: MappingRule) {
  const result = await confirm({
    title: "确认删除",
    description: `确定要删除映射规则 "${rule.original} → ${rule.target}" 吗？`,
  });

  if (!result) return;

  const index = mappings.value.findIndex((m) => m.id === rule.id);
  if (index !== -1) {
    mappings.value.splice(index, 1);
    saveSettings();
    success("映射规则已删除");
  }
}

// 切换规则启用状态
function toggleMapping(rule: MappingRule) {
  rule.enabled = !rule.enabled;
  saveSettings();
}

// 导出映射规则
function exportMappings() {
  try {
    const data = {
      mappings: mappings.value,
      exportedAt: Date.now(),
      version: "1.0",
    };
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
    const data = JSON.parse(text);
    if (data.mappings && Array.isArray(data.mappings)) {
      mappings.value = [...mappings.value, ...data.mappings];
      saveSettings();
      success("映射规则导入成功");
    } else {
      error("文件格式不正确");
    }
  } catch (e) {
    handlePromiseError(e, "导入失败");
  } finally {
    input.value = "";
  }
}

// 清除历史记录
async function clearHistory() {
  const result = await confirm({
    title: "确认清除",
    description: "确定要清除所有分析历史记录吗？此操作不可恢复。",
  });

  if (!result) return;

  history.value = [];
  saveSettings();
  success("历史记录已清除");
}

onMounted(() => {
  loadSettings();
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
            onClick: () => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = '.json';
              input.onchange = importMappings;
              input.click();
            },
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

      <!-- 配置卡片 -->
      <div class="mb-6 p-4 rounded-xl border border-border/50 bg-card">
        <div class="flex items-center gap-2 mb-4">
          <Settings class="h-4 w-4 text-primary" />
          <h3 class="font-semibold text-sm">分析配置</h3>
        </div>

        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <div class="flex-1">
              <div class="font-medium text-sm mb-0.5">自动分析</div>
              <div class="text-xs text-muted-foreground">
                阅读时自动分析文本中的映射关系
              </div>
            </div>
            <Switch
              v-model:checked="autoAnalysis"
              @update:checked="saveSettings"
            />
          </div>

          <div class="flex items-center justify-between">
            <div class="flex-1">
              <div class="font-medium text-sm mb-0.5">在阅读器中显示映射</div>
              <div class="text-xs text-muted-foreground">
                在阅读页面显示识别到的映射关系
              </div>
            </div>
            <Switch
              v-model:checked="showMappingsInReader"
              @update:checked="saveSettings"
            />
          </div>

          <div class="flex items-center justify-between">
            <div class="flex-1">
              <div class="font-medium text-sm mb-0.5">高亮显示映射</div>
              <div class="text-xs text-muted-foreground">
                在文本中高亮显示识别到的映射词
              </div>
            </div>
            <Switch
              v-model:checked="highlightMappings"
              @update:checked="saveSettings"
            />
          </div>
        </div>
      </div>

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
                  typeConfig[mapping.type].color,
                ]"
              >
                <component
                  :is="typeConfig[mapping.type].icon"
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
                  :class="typeConfig[mapping.type].color"
                  class="text-xs"
                >
                  {{ typeConfig[mapping.type].label }}
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
