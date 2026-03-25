<script setup lang="ts">
/**
 * AI 模型设置页面
 * 管理实验性的本地 AI 运行时模型
 */
import { useAiSettingsView } from "@/composables/useAiSettingsView";
import AiSettingsContent from "@/components/ai-settings/AiSettingsContent.vue";
import AiSettingsHeader from "@/components/ai-settings/AiSettingsHeader.vue";

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

    <AiSettingsHeader
      :can-clear-cache="Boolean(aiStore.cacheStats)"
      @back="goBack"
      @clear-cache="clearCache"
    />

    <AiSettingsContent
      :is-supported="aiStore.isSupported"
      :is-loading="aiStore.isLoading"
      :is-model-loaded="aiStore.isModelLoaded"
      :loading-title="aiStore.loadingTitle"
      :load-status="aiStore.loadStatus"
      :load-progress="aiStore.loadProgress"
      :loading-steps="aiStore.loadingSteps"
      :error="aiStore.error"
      :current-model="aiStore.currentModel"
      :models="aiStore.models"
      :downloading-model="aiStore.downloadingModel"
      :storage-usage="aiStore.storageUsage"
      :cache-stats="aiStore.cacheStats"
      :get-model-series-icon="getModelSeriesIcon"
      @retry="retryLoading"
      @dismiss-error="aiStore.clearError"
      @download-model="handleDownloadModel"
      @unload-model="handleUnloadModel"
    />
  </div>
</template>

<style scoped>
.h-safe-top {
  height: env(safe-area-inset-top);
}
</style>
