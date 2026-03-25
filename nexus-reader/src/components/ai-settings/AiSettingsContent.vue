<script setup lang="ts">
import type { Component } from "vue";
import type { ModelInfo } from "@/types/ai";
import type { BrowserStorageEstimate } from "@/utils/browserStorage";
import type {
  RuntimeCacheStats,
  RuntimeLoadingStep,
} from "@/stores/ai/store/types";
import AiSettingsModelList from "./AiSettingsModelList.vue";
import AiSettingsStatusPanel from "./AiSettingsStatusPanel.vue";
import AiSettingsStorageFooter from "./AiSettingsStorageFooter.vue";

defineProps<{
  isSupported: boolean;
  isLoading: boolean;
  isModelLoaded: boolean;
  loadingTitle: string;
  loadStatus: string;
  loadProgress: number;
  loadingSteps: RuntimeLoadingStep[];
  error: string | null;
  currentModel: string | null;
  models: ModelInfo[];
  downloadingModel: string | null;
  storageUsage: BrowserStorageEstimate | null;
  cacheStats: RuntimeCacheStats | null;
  getModelSeriesIcon: (modelId: string) => Component;
}>();

const emit = defineEmits<{
  retry: [];
  dismissError: [];
  downloadModel: [modelId: string];
  unloadModel: [];
}>();
</script>

<template>
  <main class="max-w-3xl mx-auto px-4 py-6 space-y-8">
    <div class="rounded-xl border border-border/50 bg-card px-4 py-3 text-xs text-muted-foreground">
      当前页面只管理实验性的本地 AI 运行时模型。它不代表完整 AI 功能闭环，也不会替代服务端 AI addon。
    </div>

    <AiSettingsStatusPanel
      :is-supported="isSupported"
      :is-loading="isLoading"
      :is-model-loaded="isModelLoaded"
      :loading-title="loadingTitle"
      :load-status="loadStatus"
      :load-progress="loadProgress"
      :loading-steps="loadingSteps"
      :error="error"
      :current-model="currentModel"
      @retry="emit('retry')"
      @dismiss-error="emit('dismissError')"
    />

    <AiSettingsModelList
      :models="models"
      :current-model="currentModel"
      :is-loading="isLoading"
      :downloading-model="downloadingModel"
      :get-model-series-icon="getModelSeriesIcon"
      @download="emit('downloadModel', $event)"
      @unload="emit('unloadModel')"
    />

    <AiSettingsStorageFooter
      :storage-usage="storageUsage"
      :cache-stats="cacheStats"
    />
  </main>
</template>
