<script setup lang="ts">
import { useSettingsView } from "@/composables/useSettingsView";
import SettingsContent from "@/components/settings/SettingsContent.vue";

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

    <SettingsContent
      :addon-features="addonFeatures"
      :storage-usage="storageUsage"
      :addon-entry-cards="addonEntryCards"
      :client-routing-loading="clientRoutingLoading"
      :client-routing-summary="clientRoutingSummary"
      @back="goBack"
      @export-data="handleExportData"
      @clear-cache="handleClearCache"
      @update-addon-feature="
        (feature, enabled) => updateAddonFeature(feature, enabled)
      "
      @refresh-client-routing="refreshClientRouting"
      @navigate="navigateTo"
    />
  </div>
</template>

<style scoped>
.h-safe-top {
  height: env(safe-area-inset-top, 0px);
}
</style>
