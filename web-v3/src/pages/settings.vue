<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import {
  ArrowLeft,
  Download,
  Info,
  Monitor,
  Trash2,
  Database,
  Settings,
  HardDrive,
  Moon,
  Sun,
} from "lucide-vue-next";
import { Switch } from "@/components/ui/switch";
import { useMessage } from "@/composables/useMessage";
import { useConfirm } from "@/composables/useConfirm";
import { useErrorHandler } from "@/composables/useErrorHandler";
import { useSettingsStore } from "@/stores/settings";
import { groupApi } from "@/api/group";
import { replaceApi } from "@/api/replace";
import { sourceApi } from "@/api/source";

const router = useRouter();
const { success, error } = useMessage();
const { confirm } = useConfirm();
const { handlePromiseError } = useErrorHandler();
const settingsStore = useSettingsStore();

const storageUsage = ref<{ used: number; quota: number } | null>(null);

// Data Management
async function handleExportData() {
  try {
    const [groups, replaces, sources] = await Promise.all([
      groupApi.getBookGroups(),
      replaceApi.getReplaceRules(),
      sourceApi.getBookSources(),
    ]);

    const data = {
      groups: groups.data,
      replaces: replaces.data,
      sources: sources.data,
      timestamp: Date.now(),
      version: "3.0",
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reader_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    success("备份导出成功");
  } catch (e) {
    handlePromiseError(e, "导出失败");
  }
}

// 格式化存储大小
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

async function handleClearCache() {
  const result = await confirm({
    title: "确认清除缓存",
    description:
      "确定清除所有应用缓存吗？这将重置所有本地设置。此操作不可恢复。",
    variant: "destructive",
  });
  if (!result) return;
  localStorage.clear();
  location.reload();
}

function goBack() {
  router.back();
}

onMounted(async () => {
  // 获取存储使用情况
  if (navigator.storage?.estimate) {
    const estimate = await navigator.storage.estimate();
    storageUsage.value = {
      used: estimate.usage || 0,
      quota: estimate.quota || 0,
    };
  }
});
</script>

<template>
  <div class="min-h-screen bg-background selection:bg-primary/20">
    <div class="h-safe-top" />

    <!-- 主内容区 -->
    <main class="px-5 max-w-7xl mx-auto pt-6 sm:pt-8 pb-32">
      <!-- 第一行：返回按钮（左侧） -->
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
      </div>

      <!-- 第二行：标题 -->
      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center gap-2 shrink-0">
          <Settings class="w-4 h-4 text-primary" />
          <h2
            class="text-sm font-bold text-muted-foreground uppercase tracking-wider"
          >
            系统设置
          </h2>
        </div>
      </div>
      <!-- 外观设置 -->
      <section
        class="mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500"
      >
        <div class="flex items-center gap-2 mb-4 px-1">
          <Monitor class="w-4 h-4 text-primary" />
          <h2
            class="text-sm font-bold text-muted-foreground uppercase tracking-wider"
          >
            外观设置
          </h2>
        </div>
        <div
          class="rounded-2xl border border-border/50 bg-card hover:bg-muted/30 transition-all duration-300 hover:shadow-lg hover:shadow-black/5 overflow-hidden"
        >
          <div
            class="p-5 flex items-center justify-between border-b border-border/40"
          >
            <div class="flex items-center gap-4">
              <div
                class="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center"
              >
                <Moon
                  v-if="settingsStore.isDark"
                  class="h-6 w-6 text-purple-500"
                />
                <Sun v-else class="h-6 w-6 text-purple-500" />
              </div>
              <div>
                <h3 class="font-semibold text-base">暗色模式</h3>
                <p class="text-sm text-muted-foreground mt-0.5">
                  切换应用的整体主题配色
                </p>
              </div>
            </div>
            <Switch
              :checked="settingsStore.isDark"
              @update:checked="settingsStore.toggleDark"
              class="data-[state=checked]:bg-primary"
            />
          </div>
        </div>
      </section>

      <!-- 数据管理 -->
      <section
        class="mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100"
      >
        <div class="flex items-center gap-2 mb-4 px-1">
          <Database class="w-4 h-4 text-primary" />
          <h2
            class="text-sm font-bold text-muted-foreground uppercase tracking-wider"
          >
            数据管理
          </h2>
        </div>
        <div class="space-y-3">
          <div
            class="group rounded-2xl border border-border/50 bg-card hover:bg-muted/30 cursor-pointer transition-all duration-300 hover:shadow-lg hover:shadow-black/5 hover:-translate-y-0.5 active:scale-[0.98] overflow-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            @click="handleExportData"
            role="button"
            tabindex="0"
            @keydown.enter="handleExportData"
            @keydown.space.prevent="handleExportData"
            aria-label="导出数据备份"
          >
            <div class="p-5 flex items-center justify-between">
              <div class="flex items-center gap-4">
                <div
                  class="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center group-hover:bg-primary/20 transition-colors"
                >
                  <Download class="h-6 w-6" />
                </div>
                <div class="flex flex-col">
                  <span class="font-semibold text-base">导出数据备份</span>
                  <span class="text-xs text-muted-foreground mt-0.5"
                    >备份书源、分组、替换规则等配置数据</span
                  >
                </div>
              </div>
              <div class="opacity-0 group-hover:opacity-100 transition-opacity">
                <Download class="h-5 w-5 text-muted-foreground" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 存储管理 -->
      <section
        class="mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200"
      >
        <div class="flex items-center gap-2 mb-4 px-1">
          <HardDrive class="w-4 h-4 text-primary" />
          <h2
            class="text-sm font-bold text-muted-foreground uppercase tracking-wider"
          >
            存储管理
          </h2>
        </div>
        <div class="space-y-3">
          <!-- 存储使用情况 -->
          <div
            v-if="storageUsage"
            class="rounded-2xl border border-border/50 bg-card hover:bg-muted/30 transition-all duration-300 hover:shadow-lg hover:shadow-black/5 overflow-hidden"
          >
            <div class="p-5">
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-3">
                  <HardDrive class="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p class="text-sm font-medium">存储使用</p>
                    <p class="text-xs text-muted-foreground mt-0.5">
                      {{ formatBytes(storageUsage.used) }} /
                      {{ formatBytes(storageUsage.quota) }}
                    </p>
                  </div>
                </div>
              </div>
              <div class="w-full bg-muted rounded-full h-2 overflow-hidden">
                <div
                  class="bg-primary h-2 rounded-full transition-all duration-300"
                  :style="{
                    width: `${Math.min(
                      (storageUsage.used / storageUsage.quota) * 100,
                      100
                    )}%`,
                  }"
                />
              </div>
            </div>
          </div>

          <!-- 清除缓存 -->
          <div
            class="group rounded-2xl border border-destructive/30 bg-card hover:bg-destructive/5 cursor-pointer transition-all duration-300 hover:shadow-lg hover:shadow-destructive/10 hover:-translate-y-0.5 active:scale-[0.98] overflow-hidden focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2"
            @click="handleClearCache"
            role="button"
            tabindex="0"
            @keydown.enter="handleClearCache"
            @keydown.space.prevent="handleClearCache"
            aria-label="清除应用缓存"
          >
            <div class="p-5 flex items-center justify-between">
              <div class="flex items-center gap-4">
                <div
                  class="w-12 h-12 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center group-hover:bg-destructive/20 transition-colors"
                >
                  <Trash2 class="h-6 w-6" />
                </div>
                <div class="flex flex-col">
                  <span class="font-semibold text-base text-destructive"
                    >清除应用缓存</span
                  >
                  <span class="text-xs text-muted-foreground mt-0.5"
                    >清除所有本地缓存和设置（不会删除服务器数据）</span
                  >
                </div>
              </div>
              <div class="opacity-0 group-hover:opacity-100 transition-opacity">
                <Trash2 class="h-5 w-5 text-destructive" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 关于 -->
      <section
        class="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-300"
      >
        <div class="flex items-center gap-2 mb-4 px-1">
          <Info class="w-4 h-4 text-primary" />
          <h2
            class="text-sm font-bold text-muted-foreground uppercase tracking-wider"
          >
            关于
          </h2>
        </div>
        <div
          class="rounded-2xl border border-border/50 bg-card hover:bg-muted/30 transition-all duration-300 hover:shadow-lg hover:shadow-black/5 overflow-hidden"
        >
          <div class="p-8 text-center space-y-5">
            <div class="relative inline-flex items-center justify-center">
              <div
                class="absolute inset-0 bg-primary/20 blur-2xl rounded-full"
              />
              <div
                class="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center border border-primary/20 shadow-lg"
              >
                <Monitor class="h-10 w-10 text-primary" />
              </div>
            </div>
            <div class="space-y-2">
              <h3 class="text-2xl font-bold tracking-tight">Reader Web v3</h3>
              <p class="text-sm text-muted-foreground">
                Modern Web Reader powered by Shadcn Vue
              </p>
            </div>
            <div class="pt-2 flex items-center justify-center gap-4 text-sm">
              <a
                href="https://github.com/hectorqin/reader"
                target="_blank"
                class="text-primary hover:text-primary/80 hover:underline transition-colors font-medium"
              >
                GitHub
              </a>
              <span class="text-muted-foreground/50">•</span>
              <span class="text-muted-foreground">MIT License</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.h-safe-top {
  height: env(safe-area-inset-top, 0px);
}
</style>
