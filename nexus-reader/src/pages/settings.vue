<script setup lang="ts">
import { computed, ref, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  Compass,
  Download,
  Info,
  Trash2,
  Database,
  Settings,
  HardDrive,
  Brain,
} from "lucide-vue-next";
import { useMessage } from "@/composables/useMessage";
import { useConfirm } from "@/composables/useConfirm";
import { useErrorHandler } from "@/composables/useErrorHandler";
import { bookshelfJourneyService } from "@/services/journey/bookshelf";
import { searchJourneyService } from "@/services/journey/search";
import { syncJourneyService } from "@/services/journey/sync";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/common";
import {
  getOptionalFeatureState,
  isOptionalFeature,
  setOptionalFeatureEnabled,
  type OptionalFeature,
} from "@/utils/features";

const router = useRouter();
const route = useRoute();
const { success, warning } = useMessage();
const { confirm } = useConfirm();
const { handlePromiseError } = useErrorHandler();

const storageUsage = ref<{ used: number; quota: number } | null>(null);
const addonFeatures = ref(getOptionalFeatureState());

const APP_LOCAL_STORAGE_KEYS = [
  "app-config",
  "reader-progress",
  "reader-settings",
  "nexus_auth_token",
  "nexus_default_model",
  "nexus_available_models",
  "offline_operations",
  "offline_content",
] as const;

const LEGACY_LOCAL_STORAGE_KEYS = [
  "ai-analysis-config",
  "ai-analysis-mappings",
] as const;

const APP_INDEXED_DB_NAMES = ["nexus-reader", "nexus-ai-models"] as const;

type ClientRoutingAnalytics = {
  window: string;
  routeCounts: Record<string, number>;
  routeSharePct: Record<string, number>;
  latencySummary: Record<string, { samples: number; p50: number; p95: number; avg: number }>;
  note?: string;
};

const clientRouting = ref<ClientRoutingAnalytics | null>(null);
const clientRoutingLoading = ref(false);

const addonFeatureToggles: Array<{
  key: OptionalFeature;
  label: string;
  description: string;
  icon: typeof Compass;
  color: string;
  bg: string;
}> = [
  {
    key: "discovery",
    label: "探索发现",
    description: "发现页与阅读周报改为可选模块",
    icon: Compass,
    color: "text-orange-500",
    bg: "bg-orange-500/10",
  },
  {
    key: "ai",
    label: "AI 助手",
    description: "本地 AI 运行时与映射规则改为可选模块",
    icon: Brain,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
  },
  {
    key: "decoder",
    label: "解密词典",
    description: "解码与词典管理改为可选模块",
    icon: Info,
    color: "text-purple-500",
    bg: "bg-purple-500/10",
  },
];

const addonEntryCards = computed(() =>
  [
    {
      feature: "discovery" as OptionalFeature,
      label: "探索发现",
      description: "发现新书与阅读周报",
      icon: Compass,
      path: "/discovery",
      color: "text-orange-500",
      bg: "bg-orange-500/10",
    },
    {
      feature: "decoder" as OptionalFeature,
      label: "解密词典",
      description: "查看和编辑解密词典",
      icon: Info,
      path: "/decoder-dictionary",
      color: "text-purple-500",
      bg: "bg-purple-500/10",
    },
    {
      feature: "ai" as OptionalFeature,
      label: "AI 模型",
      description: "实验性本地 AI 运行时管理",
      icon: Brain,
      path: "/ai-settings",
      color: "text-green-500",
      bg: "bg-green-500/10",
    },
    {
      feature: "ai" as OptionalFeature,
      label: "AI 映射规则",
      description: "AI 映射规则与分析历史",
      icon: Brain,
      path: "/ai-analysis-settings",
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
  ].filter((item) => addonFeatures.value[item.feature])
);

// Data Management
async function handleExportData() {
  try {
    const [groups, replaces, sources] = await Promise.all([
      bookshelfJourneyService.listGroups(),
      bookshelfJourneyService.listReplaceRules(),
      searchJourneyService.getSources(),
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

async function refreshStorageUsage() {
  if (!navigator.storage?.estimate) {
    storageUsage.value = null;
    return;
  }

  const estimate = await navigator.storage.estimate();
  storageUsage.value = {
    used: estimate.usage || 0,
    quota: estimate.quota || 0,
  };
}

async function deleteIndexedDB(name: string): Promise<void> {
  if (typeof indexedDB === "undefined") {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

async function handleClearCache() {
  const result = await confirm({
    title: "确认清除缓存",
    description:
      "确定清除当前应用的本地缓存与设置吗？不会影响浏览器中其他站点的数据。",
    variant: "destructive",
  });
  if (!result) return;

  try {
    for (const key of [...APP_LOCAL_STORAGE_KEYS, ...LEGACY_LOCAL_STORAGE_KEYS]) {
      localStorage.removeItem(key);
    }

    for (let index = localStorage.length - 1; index >= 0; index--) {
      const key = localStorage.key(index);
      if (key?.startsWith("offline_")) {
        localStorage.removeItem(key);
      }
    }

    if (typeof caches !== "undefined") {
      const cacheNames = await caches.keys();
      for (const name of cacheNames) {
        if (
          name.includes("webllm") ||
          name.includes("mlc") ||
          name.includes("ai-models") ||
          name.includes("nexus")
        ) {
          await caches.delete(name);
        }
      }
    }

    await Promise.all(APP_INDEXED_DB_NAMES.map((name) => deleteIndexedDB(name)));
    addonFeatures.value = getOptionalFeatureState();
    clientRouting.value = null;
    await refreshStorageUsage();
    success("应用本地缓存已清理");
  } catch (e) {
    handlePromiseError(e, "清理缓存失败");
  }
}

function goBack() {
  router.push("/");
}

function updateAddonFeature(feature: OptionalFeature, enabled: boolean) {
  addonFeatures.value = {
    ...addonFeatures.value,
    [feature]: enabled,
  };
  setOptionalFeatureEnabled(feature, enabled);
  success(enabled ? `已启用${feature}附属模块` : `已关闭${feature}附属模块`);
}

onMounted(async () => {
  addonFeatures.value = getOptionalFeatureState();

  const requestedAddon =
    typeof route.query.addon === "string" ? route.query.addon : null;
  if (requestedAddon && isOptionalFeature(requestedAddon) && !addonFeatures.value[requestedAddon]) {
    warning("该功能已从主阅读链路下沉为可选模块，可在设置页手动启用。");
  }

  // 获取存储使用情况
  await refreshStorageUsage();

  // Load client routing analytics (best-effort)
  void refreshClientRouting();
});

async function refreshClientRouting() {
  clientRoutingLoading.value = true;
  try {
    const res = await syncJourneyService.getClientRoutingAnalytics<ClientRoutingAnalytics>();
    if (res.isSuccess) {
      clientRouting.value = res.data;
    } else {
      clientRouting.value = null;
    }
  } catch (e) {
    clientRouting.value = null;
  } finally {
    clientRoutingLoading.value = false;
  }
}

function formatPct(v?: number) {
  if (v == null || Number.isNaN(v)) return "0%";
  return `${v.toFixed(2)}%`;
}

function formatMs(v?: number) {
  if (v == null || Number.isNaN(v)) return "-";
  return `${v.toFixed(0)}ms`;
}
</script>

<template>
  <div class="min-h-screen bg-background selection:bg-primary/20">
    <div class="h-safe-top" />

    <!-- 主内容区 -->
    <main class="px-5 max-w-7xl mx-auto pt-6 sm:pt-8 pb-32">
      <!-- 页面头部 -->
      <PageHeader @back="goBack" />

      <!-- 附属功能 -->
      <section
        class="mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500"
      >
        <div class="flex items-center gap-2 mb-4 px-1">
          <Brain class="w-4 h-4 text-primary" />
          <h2
            class="text-sm font-bold text-muted-foreground uppercase tracking-wider"
          >
            附属功能
          </h2>
        </div>
        <div class="space-y-3 mb-4">
          <div
            v-for="item in addonFeatureToggles"
            :key="item.key"
            class="rounded-2xl border border-border/50 bg-card overflow-hidden"
          >
            <div class="p-5 flex items-center justify-between gap-4">
              <div class="flex items-center gap-4 min-w-0">
                <div
                  class="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                  :class="[item.bg, item.color]"
                >
                  <component :is="item.icon" class="h-6 w-6" />
                </div>
                <div class="min-w-0">
                  <h3 class="font-semibold text-base mb-1">{{ item.label }}</h3>
                  <p class="text-xs text-muted-foreground">
                    {{ item.description }}
                  </p>
                </div>
              </div>
              <Switch
                :checked="addonFeatures[item.key]"
                @update:checked="(value: boolean) => updateAddonFeature(item.key, value)"
              />
            </div>
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div
            v-for="item in addonEntryCards"
            :key="item.path"
            class="group rounded-2xl border border-border/50 bg-card hover:bg-muted/30 cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] overflow-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            @click="router.push(item.path)"
            role="button"
            tabindex="0"
            @keydown.enter="router.push(item.path)"
            @keydown.space.prevent="router.push(item.path)"
            :aria-label="item.label"
          >
            <div class="p-5 flex items-center gap-4">
              <div
                class="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-colors"
                :class="[item.bg, item.color]"
              >
                <component :is="item.icon" class="h-6 w-6" />
              </div>
              <div class="flex-1 min-w-0">
                <h3 class="font-semibold text-base mb-1">{{ item.label }}</h3>
                <p class="text-xs text-muted-foreground line-clamp-1">
                  {{ item.description }}
                </p>
              </div>
            </div>
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
            class="group rounded-2xl border border-border/50 bg-card hover:bg-muted/30 cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] overflow-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            @click="handleExportData"
            role="button"
            tabindex="0"
            @keydown.enter="handleExportData"
            @keydown.space.prevent="handleExportData"
            aria-label="导出数据备份"
          >
            <div class="p-5 flex items-center gap-4">
              <div
                class="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors"
              >
                <Download class="h-6 w-6" />
              </div>
              <div class="flex-1 min-w-0">
                <h3 class="font-semibold text-base mb-1">导出数据备份</h3>
                <p class="text-xs text-muted-foreground line-clamp-1">
                  备份书源、分组、替换规则等配置数据
                </p>
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
            class="rounded-2xl border border-border/50 bg-card overflow-hidden"
          >
            <div class="p-5">
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-3">
                  <div
                    class="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center"
                  >
                    <HardDrive class="h-5 w-5" />
                  </div>
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
            class="group rounded-2xl border border-destructive/30 bg-card hover:bg-destructive/5 cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] overflow-hidden focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2"
            @click="handleClearCache"
            role="button"
            tabindex="0"
            @keydown.enter="handleClearCache"
            @keydown.space.prevent="handleClearCache"
            aria-label="清除应用缓存"
          >
            <div class="p-5 flex items-center gap-4">
              <div
                class="w-12 h-12 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center shrink-0 group-hover:bg-destructive/20 transition-colors"
              >
                <Trash2 class="h-6 w-6" />
              </div>
              <div class="flex-1 min-w-0">
                <h3 class="font-semibold text-base text-destructive mb-1">
                  清除应用缓存
                </h3>
                <p class="text-xs text-muted-foreground line-clamp-1">
                  清除所有本地缓存和设置（不会删除服务器数据）
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 直连效果（可观测） -->
      <section class="mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-250">
        <div class="flex items-center gap-2 mb-4 px-1">
          <Info class="w-4 h-4 text-primary" />
          <h2 class="text-sm font-bold text-muted-foreground uppercase tracking-wider">
            网络路径 / 直连效果
          </h2>
          <span v-if="clientRouting?.window" class="text-xs text-muted-foreground/70 ml-auto">
            窗口：{{ clientRouting.window }}
          </span>
        </div>

        <div class="rounded-2xl border border-border/50 bg-card overflow-hidden">
          <div class="p-5 flex items-start justify-between gap-3">
            <div class="space-y-1">
              <p class="text-sm font-medium">路由占比</p>
              <p class="text-xs text-muted-foreground">
                direct / edge / direct_fallback
              </p>
            </div>
            <button
              class="h-8 px-3 text-xs rounded-full border bg-background hover:bg-muted transition-colors"
              :disabled="clientRoutingLoading"
              @click="refreshClientRouting"
            >
              {{ clientRoutingLoading ? "刷新中..." : "刷新" }}
            </button>
          </div>

          <div class="px-5 pb-5 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div class="rounded-xl border border-border/50 bg-muted/20 p-4">
              <p class="text-xs text-muted-foreground mb-1">direct</p>
              <p class="text-lg font-semibold">
                {{ formatPct(clientRouting?.routeSharePct?.direct) }}
              </p>
              <p class="text-xs text-muted-foreground mt-2">
                p50 {{ formatMs(clientRouting?.latencySummary?.direct?.p50) }} ·
                p95 {{ formatMs(clientRouting?.latencySummary?.direct?.p95) }}
              </p>
            </div>
            <div class="rounded-xl border border-border/50 bg-muted/20 p-4">
              <p class="text-xs text-muted-foreground mb-1">edge</p>
              <p class="text-lg font-semibold">
                {{ formatPct(clientRouting?.routeSharePct?.edge) }}
              </p>
              <p class="text-xs text-muted-foreground mt-2">
                p50 {{ formatMs(clientRouting?.latencySummary?.edge?.p50) }} ·
                p95 {{ formatMs(clientRouting?.latencySummary?.edge?.p95) }}
              </p>
            </div>
            <div class="rounded-xl border border-border/50 bg-muted/20 p-4">
              <p class="text-xs text-muted-foreground mb-1">direct_fallback</p>
              <p class="text-lg font-semibold">
                {{ formatPct(clientRouting?.routeSharePct?.direct_fallback) }}
              </p>
              <p class="text-xs text-muted-foreground mt-2">
                p50 {{ formatMs(clientRouting?.latencySummary?.direct_fallback?.p50) }} ·
                p95 {{ formatMs(clientRouting?.latencySummary?.direct_fallback?.p95) }}
              </p>
            </div>
          </div>

          <div v-if="clientRouting?.note" class="px-5 pb-5 text-xs text-muted-foreground/70">
            {{ clientRouting.note }}
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
          class="rounded-2xl border border-border/50 bg-card hover:bg-muted/30 transition-all duration-200 hover:shadow-md overflow-hidden"
        >
          <div class="p-8 text-center space-y-5">
            <div class="relative inline-flex items-center justify-center">
              <div
                class="absolute inset-0 bg-primary/20 blur-2xl rounded-full"
              />
              <div
                class="relative w-20 h-20 rounded-3xl bg-linear-to-br from-primary/10 to-primary/5 flex items-center justify-center border border-primary/20 shadow-lg"
              >
                <Settings class="h-10 w-10 text-primary" />
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
