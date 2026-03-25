<script setup lang="ts">
/**
 * 发现页 - Discovery / Explore
 * 特性：周报回溯、轮播图展示、精选榜单、沉浸式设计
 */
import { useDiscoveryView } from "@/composables/useDiscoveryView";
import DiscoveryContent from "@/components/discovery/DiscoveryContent.vue";
import DiscoveryHeaderBar from "@/components/discovery/DiscoveryHeaderBar.vue";

const {
  data,
  loading,
  currentPeriodLabel,
  currentPeriodButtonLabel,
  periodOptions,
  heroItems,
  featuredItems,
  rankedItems,
  dateRangeLabel,
  loadDiscovery,
  changePeriod,
  openDiscoveryItem,
  goBack,
} = useDiscoveryView();
</script>

<template>
  <div class="min-h-screen bg-background selection:bg-primary/20 pb-20">
    <div class="h-safe-top" />

    <DiscoveryHeaderBar
      :has-data="Boolean(data)"
      :current-period-label="currentPeriodLabel"
      :current-period-button-label="currentPeriodButtonLabel"
      :date-range-label="dateRangeLabel"
      :period-options="periodOptions"
      @back="goBack"
      @change-period="changePeriod"
    />

    <DiscoveryContent
      :loading="loading"
      :has-data="Boolean(data)"
      :hero-items="heroItems"
      :featured-items="featuredItems"
      :ranked-items="rankedItems"
      @open="openDiscoveryItem"
      @retry="loadDiscovery()"
    />
  </div>
</template>

<style scoped>
.h-safe-top {
  height: env(safe-area-inset-top, 0px);
}
</style>
