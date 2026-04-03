<script setup lang="ts">
import { PageHeader } from "@/components/common";
import type { AddonRouteEntry } from "@/constants/addons";
import type { BrowserStorageEstimate } from "@/utils/browserStorage";
import type { OptionalFeature } from "@/utils/features";
import type { AgentRouterConfigPatch } from "@/api/sync";
import SettingsAboutSection from "./SettingsAboutSection.vue";
import SettingsAddonSection from "./SettingsAddonSection.vue";
import SettingsMaintenanceSection from "./SettingsMaintenanceSection.vue";
import SettingsRoutingSection from "./SettingsRoutingSection.vue";
import SettingsSourcePackagesSection from "./SettingsSourcePackagesSection.vue";

type RouteStat = {
  key: string;
  label: string;
  shareLabel: string;
  p50Label: string;
  p95Label: string;
};

type ClientRoutingSummary = {
  window: string;
  note: string;
  routes: RouteStat[];
};

type AgentRoutingSummary = {
  window: string;
  totalSelectionsLabel: string;
  aiAttemptRateLabel: string;
  fallbackRateLabel: string;
  aiTimeoutRateLabel: string;
  topSkills: Array<{
    key: string;
    label: string;
    countLabel: string;
    shareLabel: string;
  }>;
};

type AgentRoutingConfigSummary = {
  enabledLabel: string;
  shadowModeLabel: string;
  aiEnabledLabel: string;
  rolloutLabel: string;
  timeoutLabel: string;
  confidenceLabel: string;
  includeRoutesLabel: string;
  excludeRoutesLabel: string;
};

type AgentRoutingConfigRaw = {
  source: string;
  overrideUpdatedAt: string;
  overrideUpdatedBy: string;
  enabled: boolean;
  shadowMode: boolean;
  allowAISelection: boolean;
  rolloutPercent: number;
  aiMaxLatencyMs: number;
  minConfidencePercent: number;
  includeRoutes: string[];
  excludeRoutes: string[];
};

type AgentRoutingAuditSummary = {
  hasMore: boolean;
  records: Array<{
    id: string;
    action: string;
    actor: string;
    timestamp: string;
    changeItems: string[];
  }>;
};

type SourcePackageSummary = {
  sourceId: string;
  sourceName: string;
  host: string;
  packageId: string;
  generatedAtMs: number;
  enabled: boolean;
  valid: boolean;
  overallHealthScore: number;
  recommended: boolean;
  searchStatus: "pass" | "warn" | "fail" | "unknown";
  bookStatus: "pass" | "warn" | "fail" | "unknown";
  tocStatus: "pass" | "warn" | "fail" | "unknown";
  contentStatus: "pass" | "warn" | "fail" | "unknown";
  tags: string[];
};

type SourcePackageDetailSummary = {
  packageId: string;
  sourceLabel: string;
  generatedAtLabel: string;
  validationLabel: string;
  healthLabel: string;
  healthScoreLabel: string;
  segmentItems: string[];
  warningItems: string[];
  errorItems: string[];
  capabilityItems: string[];
  searchStrategyItems: string[];
  sampleItems: string[];
  riskItems: string[];
};

defineProps<{
  addonFeatures: Record<string, boolean>;
  storageUsage: BrowserStorageEstimate | null;
  addonEntryCards: AddonRouteEntry[];
  clientRoutingLoading: boolean;
  clientRoutingSummary: ClientRoutingSummary;
  agentRoutingLoading: boolean;
  agentRoutingSummary: AgentRoutingSummary;
  agentConfigLoading: boolean;
  agentConfigSaving: boolean;
  agentConfigAuditLoading: boolean;
  agentRoutingConfigSummary: AgentRoutingConfigSummary;
  agentRoutingConfigRaw: AgentRoutingConfigRaw;
  agentRoutingAuditSummary: AgentRoutingAuditSummary;
  sourcePackagesLoading: boolean;
  sourcePackageImporting: boolean;
  sourcePackageDetailLoading: boolean;
  sourcePackages: SourcePackageSummary[];
  sourcePackageDetailSummary: SourcePackageDetailSummary;
}>();

const emit = defineEmits<{
  back: [];
  exportData: [];
  clearCache: [];
  updateAddonFeature: [feature: OptionalFeature, enabled: boolean];
  refreshClientRouting: [];
  setAgentConfigDisabled: [];
  setAgentConfigShadow: [];
  setAgentConfigCanary: [];
  saveAgentConfigCustom: [patch: AgentRouterConfigPatch];
  resetAgentConfigOverride: [];
  loadMoreAgentAudit: [];
  refreshSourcePackages: [];
  importSourcePackage: [packageJson: string];
  selectSourcePackage: [sourceId: string];
  deleteSourcePackage: [sourceId: string];
  navigate: [path: string];
}>();
</script>

<template>
  <main class="px-5 max-w-7xl mx-auto pt-6 sm:pt-8 pb-32">
    <PageHeader @back="emit('back')" />

    <SettingsAddonSection
      :addon-features="addonFeatures"
      :addon-entry-cards="addonEntryCards"
      @update-addon-feature="
        (feature, enabled) => emit('updateAddonFeature', feature, enabled)
      "
      @navigate="emit('navigate', $event)"
    />

    <SettingsMaintenanceSection
      :storage-usage="storageUsage"
      @export-data="emit('exportData')"
      @clear-cache="emit('clearCache')"
    />

    <SettingsRoutingSection
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
      @refresh="emit('refreshClientRouting')"
      @set-agent-config-disabled="emit('setAgentConfigDisabled')"
      @set-agent-config-shadow="emit('setAgentConfigShadow')"
      @set-agent-config-canary="emit('setAgentConfigCanary')"
      @save-agent-config-custom="emit('saveAgentConfigCustom', $event)"
      @reset-agent-config-override="emit('resetAgentConfigOverride')"
      @load-more-agent-audit="emit('loadMoreAgentAudit')"
    />

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
