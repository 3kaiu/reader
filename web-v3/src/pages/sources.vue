<script setup lang="ts">
/**
 * 书源管理页面 - 统一风格版
 * 特性：分组筛选、批量测速、响应式网格布局、与首页一致的布局风格
 */
import { ref, shallowRef, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import {
  RefreshCw,
  Server,
  Trash2,
  Upload,
  Download,
  Plus,
  Zap,
  Globe2,
  Edit2,
  FolderX,
  X,
} from "lucide-vue-next";
import { $get, $post } from "@/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMessage } from "@/composables/useMessage";
import { useConfirm } from "@/composables/useConfirm";
import { useErrorHandler } from "@/composables/useErrorHandler";
import ImportSource from "@/components/source/ImportSource.vue";
import EditSource from "@/components/source/EditSource.vue";
import {
  PageHeader,
  PageToolbar,
  EmptyState,
  LoadingGrid,
} from "@/components/common";
import { CheckSquare } from "lucide-vue-next";

const router = useRouter();
const { success, error } = useMessage();
const { confirm } = useConfirm();
const { handleApiError, handlePromiseError } = useErrorHandler();

// ====== 类型定义 ======
interface BookSource {
  bookSourceName: string;
  bookSourceUrl: string;
  bookSourceGroup?: string;
  enabled?: boolean;
  _ping?: number;
  _bgTest?: boolean;
}

// ====== 状态 ======
const sources = ref<BookSource[]>([]);
const loading = ref(true);
const searchKeyword = ref("");
const activeGroup = ref("全部");
const showImport = ref(false);
const showEdit = ref(false);
const currentEditSource = ref<BookSource | null>(null);
const selectedUrls = shallowRef<Set<string>>(new Set());
const isManageMode = ref(false);
const isBatchTesting = ref(false);
const showGroupInput = ref(false);
const newGroupName = ref("");

// ====== 计算属性 ======
// 分组统计
const groups = computed(() => {
  const groupMap: Record<string, number> = { 全部: sources.value.length };
  sources.value.forEach((s) => {
    const g = s.bookSourceGroup?.trim() || "未分组";
    groupMap[g] = (groupMap[g] || 0) + 1;
  });
  // 排序：全部 -> 未分组 -> 其他按数量
  const entries = Object.entries(groupMap);
  return entries.sort((a, b) => {
    if (a[0] === "全部") return -1;
    if (b[0] === "全部") return 1;
    if (a[0] === "未分组") return -1;
    if (b[0] === "未分组") return 1;
    return b[1] - a[1];
  });
});

const filteredSources = computed(() => {
  let result = sources.value;

  // 分组筛选
  if (activeGroup.value !== "全部") {
    if (activeGroup.value === "未分组") {
      result = result.filter((s) => !s.bookSourceGroup?.trim());
    } else {
      result = result.filter(
        (s) => s.bookSourceGroup?.trim() === activeGroup.value
      );
    }
  }

  // 关键词筛选
  if (searchKeyword.value) {
    const k = searchKeyword.value.toLowerCase();
    result = result.filter(
      (s) =>
        s.bookSourceName.toLowerCase().includes(k) ||
        s.bookSourceUrl.toLowerCase().includes(k) ||
        (s.bookSourceGroup || "").toLowerCase().includes(k)
    );
  }

  return result;
});

const stats = computed(() => ({
  total: sources.value.length,
  enabled: sources.value.filter((s) => s.enabled !== false).length,
  filtered: filteredSources.value.length,
  selected: selectedUrls.value.size,
}));

// ====== 方法 ======
async function loadSources() {
  loading.value = true;
  selectedUrls.value.clear();
  try {
    const res = await $get<BookSource[]>("/getBookSources");
    if (res.isSuccess) {
      sources.value = res.data || [];
    }
  } catch (e) {
    error("加载书源失败");
  } finally {
    loading.value = false;
  }
}

async function testSource(source: BookSource) {
  source._bgTest = true;
  try {
    const start = Date.now();
    const res = await $post("/testBookSource", {
      bookSourceUrl: source.bookSourceUrl,
    });
    source._ping = res.isSuccess ? Date.now() - start : -1;
  } catch {
    source._ping = -1;
  } finally {
    source._bgTest = false;
  }
}

async function batchTestSources() {
  const toTest = filteredSources.value.filter((s) => s._ping === undefined);
  if (toTest.length === 0) {
    success("所有书源已测试完毕");
    return;
  }

  isBatchTesting.value = true;
  let tested = 0;

  for (const source of toTest) {
    if (!isBatchTesting.value) break; // 允许中途停止
    await testSource(source);
    tested++;
  }

  isBatchTesting.value = false;
  success(`已测试 ${tested} 个书源`);
}

function stopBatchTest() {
  isBatchTesting.value = false;
}

async function toggleEnable(source: BookSource) {
  const oldVal = source.enabled;
  source.enabled = !oldVal;
  try {
    await $post("/saveBookSource", source);
  } catch (e) {
    source.enabled = oldVal;
    handlePromiseError(e, "状态更新失败");
  }
}

async function deleteSource(source: BookSource) {
  const result = await confirm({
    title: "确认删除",
    description: `确定删除「${source.bookSourceName}」？此操作不可恢复。`,
    variant: "destructive",
  });
  if (!result) return;
  try {
    const res = await $post("/deleteBookSource", {
      bookSourceUrl: source.bookSourceUrl,
    });
    if (res.isSuccess) {
      sources.value = sources.value.filter(
        (s) => s.bookSourceUrl !== source.bookSourceUrl
      );
      selectedUrls.value.delete(source.bookSourceUrl);
      success("删除成功");
    } else {
      handleApiError(res, "删除失败");
    }
  } catch (e) {
    handlePromiseError(e, "删除失败");
  }
}

async function batchDelete() {
  if (selectedUrls.value.size === 0) return;
  const result = await confirm({
    title: "确认删除",
    description: `确定删除选中的 ${selectedUrls.value.size} 个书源吗？此操作不可恢复。`,
    variant: "destructive",
  });
  if (!result) return;

  let successCount = 0;
  for (const url of selectedUrls.value) {
    try {
      await $post("/deleteBookSource", { bookSourceUrl: url });
      successCount++;
      sources.value = sources.value.filter((s) => s.bookSourceUrl !== url);
    } catch (e) {
      handlePromiseError(e, "删除失败", false); // 不显示 toast，批量操作只显示最终结果
    }
  }
  selectedUrls.value = new Set();
  isManageMode.value = false;
  success(`删除了 ${successCount} 个书源`);
}

function exportSources() {
  const target =
    selectedUrls.value.size > 0
      ? sources.value.filter((s) => selectedUrls.value.has(s.bookSourceUrl))
      : filteredSources.value;
  const data = JSON.stringify(target, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `booksources_${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(url);
  success(`已导出 ${target.length} 个书源`);
}

function toggleSelect(source: BookSource) {
  const newSet = new Set(selectedUrls.value);
  if (newSet.has(source.bookSourceUrl)) {
    newSet.delete(source.bookSourceUrl);
  } else {
    newSet.add(source.bookSourceUrl);
  }
  selectedUrls.value = newSet;
}

function selectAll() {
  if (selectedUrls.value.size === filteredSources.value.length) {
    selectedUrls.value = new Set();
  } else {
    selectedUrls.value = new Set(
      filteredSources.value.map((s) => s.bookSourceUrl)
    );
  }
}

function openEdit(source: BookSource) {
  currentEditSource.value = source;
  showEdit.value = true;
}

function toggleManageMode() {
  isManageMode.value = !isManageMode.value;
  if (!isManageMode.value) selectedUrls.value = new Set();
}

function getPingColor(ping: number) {
  if (ping < 0) return "text-red-600 bg-red-500/10 border-red-500/20";
  if (ping < 300) return "text-green-600 bg-green-500/10 border-green-500/20";
  if (ping < 800)
    return "text-yellow-600 bg-yellow-500/10 border-yellow-500/20";
  return "text-orange-600 bg-orange-500/10 border-orange-500/20";
}

// 获取所有已用分组名（排除全部和未分组）
const existingGroups = computed(() => {
  return groups.value
    .filter(([name]) => name !== "全部" && name !== "未分组")
    .map(([name]) => name);
});

// 批量修改选中书源的分组
async function batchSetGroup(groupName: string) {
  if (selectedUrls.value.size === 0) {
    error("请先选择书源");
    return;
  }

  const urls = Array.from(selectedUrls.value);
  const toUpdate = sources.value.filter((s) => urls.includes(s.bookSourceUrl));

  // 修改分组
  toUpdate.forEach((s) => {
    s.bookSourceGroup = groupName === "" ? undefined : groupName;
  });

  try {
    await $post("/saveBookSources", toUpdate);
    success(`已将 ${toUpdate.length} 个书源移至「${groupName || "未分组"}」`);
    selectedUrls.value = new Set();
    isManageMode.value = false;
    showGroupInput.value = false;
    newGroupName.value = "";
  } catch (e) {
    handlePromiseError(e, "修改分组失败");
  }
}

// 设置新分组
function confirmNewGroup() {
  if (!newGroupName.value.trim()) {
    error("请输入分组名称");
    return;
  }
  batchSetGroup(newGroupName.value.trim());
}

// 删除分组内所有书源
async function deleteGroupSources(groupName: string) {
  const toDelete = sources.value.filter((s) => {
    if (groupName === "未分组") {
      return !s.bookSourceGroup?.trim();
    }
    return s.bookSourceGroup?.trim() === groupName;
  });

  if (toDelete.length === 0) {
    error("该分组没有书源");
    return;
  }

  const result = await confirm({
    title: "确认删除",
    description: `确定删除「${groupName}」分组内的 ${toDelete.length} 个书源吗？此操作不可恢复。`,
    variant: "destructive",
  });
  if (!result) return;

  try {
    await $post("/deleteBookSources", toDelete);
    sources.value = sources.value.filter(
      (s) => !toDelete.some((d) => d.bookSourceUrl === s.bookSourceUrl)
    );
    success(`已删除 ${toDelete.length} 个书源`);
    if (activeGroup.value === groupName) {
      activeGroup.value = "全部";
    }
  } catch (e) {
    handlePromiseError(e, "删除失败");
  }
}

onMounted(() => loadSources());
</script>

<template>
  <div class="min-h-screen bg-background selection:bg-primary/20">
    <div class="h-safe-top" />

    <!-- 主内容区 -->
    <main class="px-5 max-w-7xl mx-auto pt-6 sm:pt-8 pb-32">
      <!-- 页面头部 -->
      <PageHeader
        :search-value="searchKeyword"
        search-placeholder="搜索书源名称、URL或分组..."
        :actions="[
          {
            label: isBatchTesting ? '停止测速' : '全量测速',
            icon: isBatchTesting ? RefreshCw : Zap,
            onClick: isBatchTesting ? stopBatchTest : batchTestSources,
            variant: 'outline',
            hideLabelOnMobile: true,
          },
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
            onClick: () => (showImport = true),
            variant: 'default',
          },
        ]"
        @update:search-value="searchKeyword = $event"
        @back="router.push('/')"
      />

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

      <!-- 分组筛选（书源页面特有功能） -->
      <div class="flex items-center gap-3 mb-6 -mt-4">
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
            onClick: () => (showImport = true),
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
        class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500"
      >
        <div
          v-for="source in filteredSources"
          :key="source.bookSourceUrl"
          class="group relative bg-card hover:bg-muted/50 rounded-2xl border transition-all duration-200 cursor-pointer overflow-hidden"
          :class="{
            'ring-2 ring-primary ring-offset-2 ring-offset-background border-primary/50':
              selectedUrls.has(source.bookSourceUrl) && isManageMode,
            'border-border/50 hover:border-border hover:shadow-md':
              !selectedUrls.has(source.bookSourceUrl),
            'opacity-50': source.enabled === false && !isManageMode,
          }"
          @click="isManageMode ? toggleSelect(source) : openEdit(source)"
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
                    @click.stop="toggleSelect(source)"
                  >
                    <Checkbox
                      :checked="selectedUrls.has(source.bookSourceUrl)"
                      @update:checked="toggleSelect(source)"
                      @click.stop
                      class="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                    />
                  </div>
                  <div
                    v-else
                    class="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                    :class="
                      source.enabled !== false
                        ? 'bg-primary/10 text-primary'
                        : 'bg-muted/50 text-muted-foreground'
                    "
                  >
                    <Globe2 class="h-4 w-4" />
                  </div>
                </div>

                <!-- 标题 & URL -->
                <div class="flex-1 min-w-0">
                  <h3
                    class="font-semibold text-sm leading-tight mb-1 text-foreground line-clamp-2"
                  >
                    {{ source.bookSourceName }}
                  </h3>
                  <p
                    class="text-xs text-muted-foreground/60 truncate font-mono"
                  >
                    {{
                      source.bookSourceUrl
                        .replace(/https?:\/\//, "")
                        .replace(/\/$/, "")
                    }}
                  </p>
                </div>
              </div>

              <!-- 操作按钮 (悬浮显示) -->
              <div
                class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                v-if="!isManageMode"
              >
                <button
                  class="w-7 h-7 rounded-md hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                  @click.stop="testSource(source)"
                  title="测速"
                  aria-label="测速"
                >
                  <Zap class="h-3.5 w-3.5" />
                </button>
                <button
                  class="w-7 h-7 rounded-md hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                  @click.stop="openEdit(source)"
                  title="编辑"
                  aria-label="编辑"
                >
                  <Edit2 class="h-3.5 w-3.5" />
                </button>
                <button
                  class="w-7 h-7 rounded-md hover:bg-destructive/10 hover:text-destructive flex items-center justify-center text-muted-foreground transition-colors"
                  @click.stop="deleteSource(source)"
                  title="删除"
                  aria-label="删除"
                >
                  <Trash2 class="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <!-- 底部: 分组 + 测速结果 + 开关 -->
            <div
              class="flex items-center justify-between pt-2 border-t border-border/40"
            >
              <!-- 分组标签 -->
              <Badge
                v-if="source.bookSourceGroup"
                variant="secondary"
                class="rounded-md px-2 py-0.5 text-xs bg-secondary/60 text-muted-foreground font-normal truncate max-w-[100px]"
              >
                {{ source.bookSourceGroup }}
              </Badge>
              <div v-else class="text-xs text-muted-foreground/40">未分组</div>

              <!-- 测速结果 + 开关 -->
              <div class="flex items-center gap-2 shrink-0">
                <!-- 测速结果 -->
                <div
                  v-if="source._bgTest"
                  class="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50"
                >
                  <RefreshCw class="h-3 w-3 animate-spin text-primary" />
                  <span class="text-[10px] text-muted-foreground">测速中</span>
                </div>
                <Badge
                  v-else-if="source._ping !== undefined"
                  variant="outline"
                  class="rounded-md px-2 py-0.5 text-[10px] font-medium"
                  :class="getPingColor(source._ping)"
                >
                  <div class="w-1.5 h-1.5 rounded-full bg-current mr-1"></div>
                  {{ source._ping > 0 ? `${source._ping}ms` : "超时" }}
                </Badge>

                <!-- 快速开关 -->
                <Switch
                  v-if="!isManageMode"
                  :checked="source.enabled !== false"
                  @update:checked="toggleEnable(source)"
                  @click.stop
                  class="data-[state=checked]:bg-primary"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- 底部操作栏 (管理模式) -->
    <ManageModeBar
      v-if="isManageMode"
      :selected-count="selectedUrls.size"
      :total-count="filteredSources.length"
      :actions="[
        {
          icon: FolderX,
          onClick: () => {}, // 分组功能需要在外部处理
          title: '修改分组',
          disabled: selectedUrls.size === 0,
        },
      ]"
      @select-all="selectAll"
      @delete="batchDelete"
      @close="toggleManageMode"
    >
      <!-- 分组下拉菜单（插槽） -->
      <template #before-delete>
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <button
              class="w-9 h-9 rounded-full hover:bg-muted flex items-center justify-center transition-colors active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              title="修改分组"
              :disabled="selectedUrls.size === 0"
            >
              <FolderX class="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="center"
            side="top"
            class="w-56 p-2 rounded-xl mb-2 bg-popover backdrop-blur-xl border-border shadow-lg"
          >
            <DropdownMenuItem
              @click="batchSetGroup('')"
              class="rounded-lg cursor-pointer"
            >
              设为未分组
            </DropdownMenuItem>
            <DropdownMenuSeparator
              class="my-1"
              v-if="existingGroups.length > 0"
            />
            <div class="max-h-48 overflow-y-auto px-1">
              <DropdownMenuItem
                v-for="g in existingGroups"
                :key="g"
                @click="batchSetGroup(g)"
                class="rounded-lg cursor-pointer"
              >
                {{ g }}
              </DropdownMenuItem>
            </div>
            <DropdownMenuSeparator class="my-1" />
            <div class="p-1">
              <div
                v-if="!showGroupInput"
                @click.stop="showGroupInput = true"
                class="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted cursor-pointer text-sm transition-colors"
              >
                <Plus class="h-4 w-4" /> 新建分组...
              </div>
              <div v-else class="space-y-2">
                <Input
                  v-model="newGroupName"
                  placeholder="分组名称"
                  class="h-8 text-xs"
                  @keyup.enter="confirmNewGroup"
                  autofocus
                />
                <div class="flex gap-2">
                  <Button
                    size="sm"
                    class="flex-1 h-8 text-xs"
                    @click="confirmNewGroup"
                  >
                    确定
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    class="h-8 text-xs"
                    @click="showGroupInput = false"
                  >
                    取消
                  </Button>
                </div>
              </div>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </template>
    </ManageModeBar>

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
