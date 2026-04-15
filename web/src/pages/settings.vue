<script setup lang="ts">
import { useSettingsView } from '@/composables/useSettingsView'
import SettingsContent from '@/components/settings/SettingsContent.vue'

const {
  storageUsage,
  sourcePackagesLoading,
  sourcePackageImporting,
  sourcePackageDetailLoading,
  sourcePackages,
  sourcePackageDetailSummary,
  handleExportData,
  handleClearCache,
  refreshSourcePackages,
  importSourcePackage,
  selectSourcePackage,
  deleteSourcePackage,
  navigateTo,
  goBack,
} = useSettingsView()
</script>

<template>
  <div class="min-h-screen bg-background selection:bg-primary/20">
    <div class="h-safe-top" />

    <SettingsContent
      :storage-usage="storageUsage"
      :source-packages-loading="sourcePackagesLoading"
      :source-package-importing="sourcePackageImporting"
      :source-package-detail-loading="sourcePackageDetailLoading"
      :source-packages="sourcePackages"
      :source-package-detail-summary="sourcePackageDetailSummary"
      @back="goBack"
      @export-data="handleExportData"
      @clear-cache="handleClearCache"
      @refresh-source-packages="refreshSourcePackages"
      @import-source-package="importSourcePackage"
      @select-source-package="selectSourcePackage"
      @delete-source-package="deleteSourcePackage"
      @navigate="navigateTo"
    />
  </div>
</template>

<style scoped>
.h-safe-top {
  height: env(safe-area-inset-top, 0px);
}
</style>
