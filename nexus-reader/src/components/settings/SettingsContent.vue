<script setup lang="ts">
import { PageHeader } from "@/components/common";
import type { AddonRouteEntry } from "@/constants/addons";
import type { BrowserStorageEstimate } from "@/utils/browserStorage";
import type { OptionalFeature } from "@/utils/features";
import SettingsAboutSection from "./SettingsAboutSection.vue";
import SettingsAddonSection from "./SettingsAddonSection.vue";
import SettingsMaintenanceSection from "./SettingsMaintenanceSection.vue";
import SettingsRoutingSection from "./SettingsRoutingSection.vue";

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

defineProps<{
  addonFeatures: Record<string, boolean>;
  storageUsage: BrowserStorageEstimate | null;
  addonEntryCards: AddonRouteEntry[];
  clientRoutingLoading: boolean;
  clientRoutingSummary: ClientRoutingSummary;
}>();

const emit = defineEmits<{
  back: [];
  exportData: [];
  clearCache: [];
  updateAddonFeature: [feature: OptionalFeature, enabled: boolean];
  refreshClientRouting: [];
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
      @refresh="emit('refreshClientRouting')"
    />

    <SettingsAboutSection />
  </main>
</template>
