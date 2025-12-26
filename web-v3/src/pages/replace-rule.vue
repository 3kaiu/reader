<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import {
  ArrowLeft,
  Search,
  Plus,
  Trash2,
  Upload,
  Download,
  Wand2,
  CheckSquare,
  X,
  Edit2,
  RefreshCw,
} from "lucide-vue-next";
import { replaceApi, type ReplaceRule } from "@/api/replace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { useMessage } from "@/composables/useMessage";
import { useConfirm } from "@/composables/useConfirm";
import { useErrorHandler } from "@/composables/useErrorHandler";
import EditRule from "@/components/replace/EditRule.vue";
import ImportRule from "@/components/replace/ImportRule.vue";

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
      <!-- 第一行：返回、搜索（居中）、导入/导出/新增规则（居右） -->
      <div class="flex items-center gap-3 mb-4">
        <!-- 返回按钮 -->
        <button
          class="w-10 h-10 rounded-full hover:bg-secondary/80 flex items-center justify-center transition-colors shrink-0"
          @click="goBack"
          title="返回书架"
          aria-label="返回书架"
        >
          <ArrowLeft class="h-5 w-5 text-muted-foreground" />
        </button>

        <!-- 搜索框（居中） -->
        <div class="flex-1 flex justify-center">
          <div class="relative group w-full max-w-md">
            <div
              class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none z-10"
            >
              <Search
                class="h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors"
              />
            </div>
            <Input
              v-model="searchKeyword"
              class="pl-10 pr-10 h-10 rounded-full bg-secondary/50 border-0 focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:ring-offset-0"
              placeholder="搜索规则名称、模式或范围..."
            />
            <button
              v-if="searchKeyword"
              class="absolute inset-y-0 right-0 pr-3 flex items-center z-10"
              @click="searchKeyword = ''"
              aria-label="清除"
            >
              <X
                class="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors"
              />
            </button>
          </div>
        </div>

        <!-- 操作按钮组（居右） -->
        <div class="flex items-center gap-2 shrink-0">
          <!-- 导出 -->
          <Button variant="outline" size="sm" @click="exportRules">
            <Download class="h-4 w-4 mr-2" />
            <span class="hidden sm:inline">导出</span>
          </Button>

          <!-- 导入规则 -->
          <Button
            variant="outline"
            size="sm"
            @click="showImport = true"
          >
            <Upload class="h-4 w-4 mr-2" />
            <span class="hidden sm:inline">导入</span>
          </Button>

          <!-- 新增规则 -->
          <Button variant="default" size="sm" @click="openEdit()">
            <Plus class="h-4 w-4 mr-2" />
            新增规则
          </Button>
        </div>
      </div>

      <!-- 第二行：全部规则（x）、启用/禁用、批量管理（居右） -->
      <div class="flex items-center gap-3 mb-6">
        <!-- 全部规则标题 -->
        <div class="flex items-center gap-2 shrink-0">
          <Wand2 class="w-4 h-4 text-primary" />
          <h2
            class="text-sm font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2"
          >
            全部规则
            <span
              class="text-xs font-normal text-muted-foreground/60 normal-case"
              >({{ stats.filtered }})</span
            >
          </h2>
        </div>

        <div class="flex-1"></div>

        <!-- 启用/禁用统计 -->
        <div
          class="flex items-center gap-2 text-sm text-muted-foreground bg-muted px-3 py-1.5 rounded-md border border-border shrink-0"
        >
          <span class="w-1.5 h-1.5 rounded-full bg-green-500"></span>
          <span>{{ stats.enabled }} 启用</span>
          <span class="opacity-50">/</span>
          <span>{{ stats.total - stats.enabled }} 禁用</span>
        </div>

        <!-- 批量管理按钮 -->
        <Button
          variant="outline"
          @click="toggleManageMode"
          :class="
            isManageMode && 'bg-primary/10 text-primary border-primary/20'
          "
          class="shrink-0"
        >
          <CheckSquare class="h-4 w-4 mr-2" />
          <span class="hidden sm:inline">{{
            isManageMode ? "退出管理" : "批量管理"
          }}</span>
        </Button>
      </div>

      <!-- 加载状态 -->
      <div
        v-if="loading"
        class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
      >
        <div
          v-for="i in 12"
          :key="i"
          class="h-32 bg-card rounded-2xl border border-border/50 animate-pulse"
        ></div>
      </div>

      <!-- 空状态 -->
      <div
        v-else-if="filteredRules.length === 0"
        class="flex flex-col items-center justify-center py-20 text-center animate-in fade-in zoom-in-95 duration-500"
      >
        <div
          class="w-20 h-20 rounded-2xl bg-muted/30 flex items-center justify-center mb-6"
        >
          <Wand2 class="h-10 w-10 text-muted-foreground/40" />
        </div>
        <h3 class="text-lg font-semibold mb-2 text-foreground">
          {{
            searchKeyword ? "未找到匹配的规则" : "暂无规则"
          }}
        </h3>
        <p
          class="text-muted-foreground text-sm mb-8 max-w-xs mx-auto leading-relaxed"
        >
          {{
            searchKeyword
              ? "尝试更换搜索关键词"
              : "创建替换规则来优化阅读体验"
          }}
        </p>
        <div class="flex gap-3">
          <Button variant="default" @click="openEdit()">
            <Plus class="h-4 w-4 mr-2" /> 新增规则
          </Button>
          <Button
            v-if="searchKeyword"
            variant="outline"
            @click="searchKeyword = ''"
          >
            查看全部
          </Button>
        </div>
      </div>

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
    <Transition
      enter-active-class="transition duration-300 cubic-bezier(0.34, 1.56, 0.64, 1)"
      enter-from-class="translate-y-20 opacity-0 scale-90"
      enter-to-class="translate-y-0 opacity-100 scale-100"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="translate-y-0 opacity-100 scale-100"
      leave-to-class="translate-y-20 opacity-0 scale-90"
    >
      <div
        v-if="isManageMode"
        class="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-auto max-w-[95vw]"
      >
        <div
          class="bg-background/95 dark:bg-background/95 backdrop-blur-xl border border-border shadow-2xl rounded-full px-3 py-2 flex items-center gap-2 text-foreground"
        >
          <button
            class="h-9 px-4 rounded-full hover:bg-muted flex items-center gap-2 transition-colors active:scale-95 font-medium text-sm"
            @click="selectAll"
          >
            <CheckSquare class="h-4 w-4" />
            <span>{{
              selectedRules.size === filteredRules.length
                ? "取消全选"
                : "全选"
            }}</span>
          </button>

          <div class="w-px h-6 bg-border mx-1"></div>

          <span
            class="text-xs font-medium px-2 text-muted-foreground tabular-nums"
            >已选 {{ selectedRules.size }}</span
          >

          <div class="w-px h-6 bg-border mx-1"></div>

          <!-- 删除 -->
          <button
            class="w-9 h-9 rounded-full hover:bg-destructive/10 text-destructive hover:text-destructive flex items-center justify-center transition-colors active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            title="删除选中"
            :disabled="selectedRules.size === 0"
            @click="batchDelete"
          >
            <Trash2 class="h-4 w-4" />
          </button>

          <!-- 关闭 -->
          <button
            class="w-9 h-9 rounded-full hover:bg-muted flex items-center justify-center transition-colors ml-1 active:scale-95"
            @click="toggleManageMode"
            title="退出管理"
          >
            <X class="h-4 w-4" />
          </button>
        </div>
      </div>
    </Transition>

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
