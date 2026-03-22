<script setup lang="ts">
/**
 * AI 模型设置页面
 * 管理实验性的本地 AI 运行时模型
 */
import {
  ArrowLeft,
  Download,
  Trash2,
  Check,
  Loader2,
  AlertCircle,
  HardDrive,
} from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAiSettingsView } from "@/composables/useAiSettingsView";
import { formatBytes } from "@/utils/browserStorage";

const {
  aiStore,
  getModelSeriesIcon,
  goBack,
  retryLoading,
  handleDownloadModel,
  clearCache,
  handleUnloadModel,
} = useAiSettingsView();
</script>

<template>
  <div class="min-h-screen bg-background selection:bg-primary/20">
    <div class="h-safe-top" />

    <!-- 顶部导航 -->
    <header
      class="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border/40"
    >
      <div
        class="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between"
      >
        <div class="flex items-center gap-3">
          <button
            class="w-8 h-8 rounded-full hover:bg-secondary flex items-center justify-center transition-colors"
            @click="goBack"
          >
            <ArrowLeft class="h-4 w-4 text-muted-foreground" />
          </button>
          <span class="font-medium text-sm">本地 AI 模型</span>
        </div>

        <Button
          v-if="aiStore.cacheStats"
          variant="ghost"
          size="sm"
          class="h-8 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          @click="clearCache"
        >
          <Trash2 class="h-3.5 w-3.5 mr-1.5" />
          清理缓存
        </Button>
      </div>
    </header>

    <main class="max-w-3xl mx-auto px-4 py-6 space-y-8">
      <div class="rounded-xl border border-border/50 bg-card px-4 py-3 text-xs text-muted-foreground">
        当前页面只管理实验性的本地 AI 运行时模型。它不代表完整 AI 功能闭环，也不会替代服务端 AI addon。
      </div>

      <!-- 错误提示 -->
      <div
        v-if="!aiStore.isSupported"
        class="p-4 rounded-xl bg-destructive/5 border border-destructive/20 text-destructive flex gap-3 text-sm animate-in fade-in slide-in-from-top-2"
      >
        <AlertCircle class="h-5 w-5 shrink-0" />
        <div>
          <p class="font-medium">WebGPU 不受支持</p>
          <p class="opacity-80 mt-0.5 text-xs">
            请使用 Chrome 113+、Edge 113+ 或 Safari 17+ 浏览器。
          </p>
        </div>
      </div>

      <!-- 当前状态 / 下载进度 -->
      <div
        v-if="aiStore.isLoading"
        class="bg-card rounded-xl border border-border/50 p-4 animate-in fade-in zoom-in-95"
      >
        <div class="flex items-center gap-3 mb-3">
          <Loader2 class="h-5 w-5 text-primary animate-spin" />
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium">{{ aiStore.loadingTitle }}</p>
            <p class="text-xs text-muted-foreground truncate">
              {{ aiStore.loadStatus }}
            </p>
          </div>
          <span class="text-xs font-mono font-medium"
            >{{ aiStore.loadProgress }}%</span
          >
        </div>
        <div class="h-1.5 bg-secondary rounded-full overflow-hidden">
          <div
            class="h-full bg-primary transition-all duration-300"
            :style="{ width: `${aiStore.loadProgress}%` }"
          />
        </div>

        <!-- 动态加载阶段指示器 -->
        <div
          class="flex items-center justify-between mt-3 text-xs text-muted-foreground"
        >
          <div
            v-for="step in aiStore.loadingSteps"
            :key="step.key"
            class="flex items-center gap-2"
          >
            <div
              class="w-2 h-2 rounded-full"
              :class="step.complete ? 'bg-primary' : 'bg-muted'"
            ></div>
            <span>{{ step.label }}</span>
          </div>
        </div>
      </div>

      <!-- 动态加载成功提示 -->
      <div
        v-if="!aiStore.isLoading && aiStore.isModelLoaded && !aiStore.error"
        class="bg-green-50 dark:bg-green-950/20 rounded-xl border border-green-200 dark:border-green-800/30 p-4 animate-in fade-in slide-in-from-top-2"
      >
        <div class="flex items-center gap-3">
          <Check class="h-5 w-5 text-green-600 dark:text-green-400" />
          <div>
            <p class="text-sm font-medium text-green-800 dark:text-green-200">
              AI模型已就绪
            </p>
            <p class="text-xs text-green-600 dark:text-green-400 mt-0.5">
              {{ aiStore.currentModel }} 已成功加载，可以开始使用AI功能
            </p>
          </div>
        </div>
      </div>

      <!-- 动态加载错误提示 -->
      <div
        v-if="aiStore.error && !aiStore.isLoading"
        class="bg-destructive/5 rounded-xl border border-destructive/20 p-4 animate-in fade-in slide-in-from-top-2"
      >
        <div class="flex items-start gap-3">
          <AlertCircle class="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-destructive">加载失败</p>
            <p class="text-xs text-destructive/80 mt-1">{{ aiStore.error }}</p>
            <div class="flex gap-2 mt-3">
              <Button
                variant="outline"
                size="sm"
                class="h-7 px-3 text-xs border-destructive/30 hover:bg-destructive/10"
                @click="retryLoading"
              >
                重试
              </Button>
              <Button
                variant="ghost"
                size="sm"
                class="h-7 px-3 text-xs text-muted-foreground hover:text-foreground"
                @click="aiStore.clearError"
              >
                忽略
              </Button>
            </div>
          </div>
        </div>
      </div>

      <!-- 可用模型列表 -->
      <div class="space-y-4">
        <div class="px-1 space-y-1">
          <h2
            class="text-xs font-medium text-muted-foreground uppercase tracking-wider"
          >
            可用模型
          </h2>
          <p class="text-[10px] text-muted-foreground/60">
            来自前端内置模型清单，按本地浏览器运行时加载
          </p>
        </div>

        <div class="grid gap-3">
          <div
            v-for="model in aiStore.models"
            :key="model.id"
            class="group relative bg-card hover:bg-muted/40 rounded-xl border border-border/40 hover:border-border transition-all duration-200 overflow-hidden"
            :class="
              aiStore.currentModel === model.id
                ? 'ring-1 ring-primary/20 bg-primary/5'
                : ''
            "
          >
            <div class="p-4 flex items-center gap-4">
              <!-- 图标 -->
              <div
                class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-colors"
                :class="
                  aiStore.currentModel === model.id
                    ? 'bg-primary/20 text-primary'
                    : 'bg-muted text-muted-foreground/60'
                "
              >
                <component :is="getModelSeriesIcon(model.id)" class="h-5 w-5" />
              </div>

              <!-- 信息 -->
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <h3 class="text-sm font-medium text-foreground truncate">
                    {{ model.name }}
                  </h3>
                  <Badge
                    v-if="aiStore.currentModel === model.id"
                    variant="secondary"
                    class="bg-primary/10 text-primary h-5 px-1.5 text-[10px] font-normal rounded"
                    >当前使用</Badge
                  >
                </div>
                <div
                  class="flex items-center gap-3 text-xs text-muted-foreground/60 font-mono"
                >
                  <span>{{ model.params }}</span>
                  <span class="w-px h-2.5 bg-border/60"></span>
                  <span>{{ model.quantization }}</span>
                  <span class="w-px h-2.5 bg-border/60"></span>
                  <span>{{ model.size }}</span>
                </div>
              </div>

              <!-- 操作 -->
              <div class="shrink-0">
                <Button
                  v-if="aiStore.currentModel !== model.id"
                  variant="outline"
                  size="sm"
                  class="h-8 px-3 text-xs font-medium rounded-lg hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors"
                  :disabled="aiStore.isLoading"
                  @click="handleDownloadModel(model.id)"
                >
                  <Download
                    v-if="aiStore.downloadingModel !== model.id"
                    class="h-3.5 w-3.5 mr-1.5"
                  />
                  <Loader2 v-else class="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  {{ aiStore.downloadingModel === model.id ? "加载中" : "加载" }}
                </Button>

                <Button
                  v-else
                  variant="ghost"
                  size="sm"
                  class="h-8 px-3 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg"
                  @click="handleUnloadModel"
                >
                  卸载
                </Button>
              </div>
            </div>
          </div>

          <!-- 空状态 -->
          <div v-if="aiStore.models.length === 0" class="py-12 text-center">
            <p class="text-sm text-muted-foreground">
              未找到可用模型
            </p>
          </div>
        </div>
      </div>

      <!-- 存储信息 Footer -->
      <div
        v-if="aiStore.storageUsage || aiStore.cacheStats"
        class="space-y-3 pt-4 border-t border-border/40"
      >
        <!-- 缓存统计 -->
        <div
          v-if="aiStore.cacheStats"
          class="bg-card rounded-xl border border-border/50 p-4"
        >
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-2">
              <HardDrive class="h-4 w-4 text-muted-foreground" />
              <span class="text-sm font-medium">运行时缓存</span>
            </div>
            <Badge variant="secondary" class="text-xs">
              {{ aiStore.cacheStats.modelCount }} 个模型
            </Badge>
          </div>

          <div class="space-y-2 text-xs text-muted-foreground">
            <div class="flex justify-between">
              <span>缓存大小:</span>
              <span class="font-mono">{{
                formatBytes(aiStore.cacheStats.totalSize)
              }}</span>
            </div>
            <div v-if="aiStore.storageUsage" class="flex justify-between">
              <span>存储使用:</span>
              <span class="font-mono"
                >{{ formatBytes(aiStore.storageUsage.used) }} /
                {{ formatBytes(aiStore.storageUsage.quota) }}</span
              >
            </div>
            <div class="flex justify-between">
              <span>加载方式:</span>
              <span class="text-green-600 dark:text-green-400"
                >运行时动态加载</span
              >
            </div>
          </div>
        </div>

        <!-- 传统存储信息 -->
        <div
          v-else-if="aiStore.storageUsage"
          class="flex items-center justify-between px-1 text-[10px] text-muted-foreground/50"
        >
          <div class="flex items-center gap-1.5">
            <HardDrive class="h-3 w-3" />
            <span
              >存储已用 {{ formatBytes(aiStore.storageUsage.used) }} /
              {{ formatBytes(aiStore.storageUsage.quota) }}</span
            >
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.h-safe-top {
  height: env(safe-area-inset-top);
}
</style>
