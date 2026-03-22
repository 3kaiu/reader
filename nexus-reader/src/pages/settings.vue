<script setup lang="ts">
import {
  Brain,
  Download,
  Info,
  Trash2,
  Database,
  Settings,
  HardDrive,
} from "lucide-vue-next";
import { ADDON_FEATURE_TOGGLES } from "@/constants/addons";
import { useSettingsView } from "@/composables/useSettingsView";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/common";
import { formatBytes } from "@/utils/browserStorage";

const {
  addonFeatures,
  storageUsage,
  addonEntryCards,
  clientRoutingLoading,
  clientRoutingSummary,
  handleExportData,
  handleClearCache,
  updateAddonFeature,
  refreshClientRouting,
  navigateTo,
  goBack,
} = useSettingsView();
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
            v-for="item in ADDON_FEATURE_TOGGLES"
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
            @click="navigateTo(item.path)"
            role="button"
            tabindex="0"
            @keydown.enter="navigateTo(item.path)"
            @keydown.space.prevent="navigateTo(item.path)"
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
          <span v-if="clientRoutingSummary.window" class="text-xs text-muted-foreground/70 ml-auto">
            窗口：{{ clientRoutingSummary.window }}
          </span>
        </div>

        <div class="rounded-2xl border border-border/50 bg-card overflow-hidden">
          <div class="p-5 flex items-start justify-between gap-3">
            <div class="space-y-1">
              <p class="text-sm font-medium">路由占比</p>
              <p class="text-xs text-muted-foreground">
                direct / edge
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

          <div class="px-5 pb-5 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div
              v-for="routeStat in clientRoutingSummary.routes"
              :key="routeStat.key"
              class="rounded-xl border border-border/50 bg-muted/20 p-4"
            >
              <p class="text-xs text-muted-foreground mb-1">{{ routeStat.label }}</p>
              <p class="text-lg font-semibold">
                {{ routeStat.shareLabel }}
              </p>
              <p class="text-xs text-muted-foreground mt-2">
                p50 {{ routeStat.p50Label }} ·
                p95 {{ routeStat.p95Label }}
              </p>
            </div>
          </div>

          <div v-if="clientRoutingSummary.note" class="px-5 pb-5 text-xs text-muted-foreground/70">
            {{ clientRoutingSummary.note }}
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
