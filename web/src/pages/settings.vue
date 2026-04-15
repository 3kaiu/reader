<script setup lang="ts">
import { useSettingsView } from '@/composables/useSettingsView'
import SettingsContent from '@/components/settings/SettingsContent.vue'

const {
  addonFeatures,
  storageUsage,
  addonEntryCards,
  toolboxMode,
  clientRoutingLoading,
  clientRoutingSummary,
  agentRoutingLoading,
  agentRoutingSummary,
  agentConfigLoading,
  agentConfigSaving,
  agentConfigAuditLoading,
  agentRoutingConfigSummary,
  agentRoutingConfigRaw,
  agentRoutingAuditSummary,
  sourcePackagesLoading,
  sourcePackageImporting,
  sourcePackageDetailLoading,
  sourcePackages,
  sourcePackageDetailSummary,
  handleExportData,
  handleClearCache,
  updateAddonFeature,
  refreshClientRouting,
  setAgentConfigDisabled,
  setAgentConfigShadow,
  setAgentConfigCanary,
  saveAgentConfigCustom,
  resetAgentConfigOverride,
  loadMoreAgentAudit,
  refreshSourcePackages,
  importSourcePackage,
  selectSourcePackage,
  deleteSourcePackage,
  toggleToolboxMode,
  navigateTo,
  goBack,
} = useSettingsView()
</script>

<template>
  <div class="min-h-screen bg-background selection:bg-primary/20">
    <div class="h-safe-top" />

    <SettingsContent
      :addon-features="addonFeatures"
      :storage-usage="storageUsage"
      :addon-entry-cards="addonEntryCards"
      :toolbox-mode="toolboxMode"
      :client-routing-loading="clientRoutingLoading"
      :client-routing-summary="clientRoutingSummary"
      :agent-routing-loading="agentRoutingLoading"
      :agent-routing-summary="agentRoutingSummary"
      :agent-config-loading="agentConfigLoading"
      :agent-config-saving="agentConfigSaving"
      :agent-config-audit-loading="agentConfigAuditLoading"
      :agent-routing-config-summary="agentRoutingConfigSummary"
      :agent-routing-config-raw="agentRoutingConfigRaw"
      :agent-routing-audit-summary="agentRoutingAuditSummary"
      :source-packages-loading="sourcePackagesLoading"
      :source-package-importing="sourcePackageImporting"
      :source-package-detail-loading="sourcePackageDetailLoading"
      :source-packages="sourcePackages"
      :source-package-detail-summary="sourcePackageDetailSummary"
      @back="goBack"
      @export-data="handleExportData"
      @clear-cache="handleClearCache"
      @update-addon-feature="(feature, enabled) => updateAddonFeature(feature, enabled)"
      @refresh-client-routing="refreshClientRouting"
      @set-agent-config-disabled="setAgentConfigDisabled"
      @set-agent-config-shadow="setAgentConfigShadow"
      @set-agent-config-canary="setAgentConfigCanary"
      @save-agent-config-custom="saveAgentConfigCustom"
      @reset-agent-config-override="resetAgentConfigOverride"
      @load-more-agent-audit="loadMoreAgentAudit"
      @refresh-source-packages="refreshSourcePackages"
      @import-source-package="importSourcePackage"
      @select-source-package="selectSourcePackage"
      @delete-source-package="deleteSourcePackage"
      @toggle-toolbox-mode="toggleToolboxMode"
      @navigate="navigateTo"
    />
  </div>
</template>

<style scoped>
.h-safe-top {
  height: env(safe-area-inset-top, 0px);
}
</style>
