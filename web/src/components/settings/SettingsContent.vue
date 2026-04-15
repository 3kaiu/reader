<script setup lang="ts">
import { PageHeader } from '@/components/common'
import type { BrowserStorageEstimate } from '@/utils/browserStorage'
import SettingsAboutSection from './SettingsAboutSection.vue'
import SettingsGeneralSection from './SettingsGeneralSection.vue'
import SettingsMaintenanceSection from './SettingsMaintenanceSection.vue'
import SettingsSourcePackagesSection from './SettingsSourcePackagesSection.vue'

type SourcePackageSummary = {
  sourceId: string
  sourceName: string
  host: string
  packageId: string
  generatedAtMs: number
  enabled: boolean
  valid: boolean
  readinessState:
    | 'draft'
    | 'blocked'
    | 'search_ready'
    | 'catalog_ready'
    | 'reading_ready'
    | 'full_flow_ready'
  searchable: boolean
  detailReady: boolean
  tocReady: boolean
  readable: boolean
  overallHealthScore: number
  recommended: boolean
  searchStatus: 'pass' | 'warn' | 'fail' | 'unknown'
  bookStatus: 'pass' | 'warn' | 'fail' | 'unknown'
  tocStatus: 'pass' | 'warn' | 'fail' | 'unknown'
  contentStatus: 'pass' | 'warn' | 'fail' | 'unknown'
  tags: string[]
}

type SourcePackageDetailSummary = {
  packageId: string
  sourceLabel: string
  generatedAtLabel: string
  validationLabel: string
  healthLabel: string
  healthScoreLabel: string
  segmentItems: string[]
  warningItems: string[]
  errorItems: string[]
  capabilityItems: string[]
  searchStrategyItems: string[]
  sampleItems: string[]
  riskItems: string[]
  readinessBlockers: string[]
  readinessSuggestedActions: string[]
}

defineProps<{
  storageUsage: BrowserStorageEstimate | null
  sourcePackagesLoading: boolean
  sourcePackageImporting: boolean
  sourcePackageDetailLoading: boolean
  sourcePackages: SourcePackageSummary[]
  sourcePackageDetailSummary: SourcePackageDetailSummary
}>()

const emit = defineEmits<{
  back: []
  exportData: []
  clearCache: []
  refreshSourcePackages: []
  importSourcePackage: [packageJson: string]
  selectSourcePackage: [sourceId: string]
  deleteSourcePackage: [sourceId: string]
  navigate: [path: string]
}>()
</script>

<template>
  <main class="px-5 max-w-7xl mx-auto pt-6 sm:pt-8 pb-32">
    <PageHeader @back="emit('back')" />

    <SettingsGeneralSection>
      <SettingsMaintenanceSection
        :storage-usage="storageUsage"
        @export-data="emit('exportData')"
        @clear-cache="emit('clearCache')"
      />
    </SettingsGeneralSection>

    <SettingsSourcePackagesSection
      :source-packages-loading="sourcePackagesLoading"
      :source-package-importing="sourcePackageImporting"
      :source-package-detail-loading="sourcePackageDetailLoading"
      :source-packages="sourcePackages"
      :source-package-detail-summary="sourcePackageDetailSummary"
      @refresh-source-packages="emit('refreshSourcePackages')"
      @import-source-package="emit('importSourcePackage', $event)"
      @select-source-package="emit('selectSourcePackage', $event)"
      @delete-source-package="emit('deleteSourcePackage', $event)"
      @navigate="emit('navigate', $event)"
    />

    <SettingsAboutSection />
  </main>
</template>
