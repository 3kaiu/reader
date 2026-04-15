<script setup lang="ts">
import type { DiscoveryItem } from '@/types/discovery'
import DiscoveryEmptyState from './DiscoveryEmptyState.vue'
import DiscoveryFeaturedSection from './DiscoveryFeaturedSection.vue'
import DiscoveryHeroCarousel from './DiscoveryHeroCarousel.vue'
import DiscoveryLoadingState from './DiscoveryLoadingState.vue'
import DiscoveryRankedSection from './DiscoveryRankedSection.vue'

defineProps<{
  loading: boolean
  hasData: boolean
  heroItems: DiscoveryItem[]
  featuredItems: DiscoveryItem[]
  rankedItems: DiscoveryItem[]
}>()

const emit = defineEmits<{
  open: [item: DiscoveryItem]
  retry: []
}>()
</script>

<template>
  <main class="max-w-7xl mx-auto px-4 pt-6 space-y-10">
    <DiscoveryLoadingState v-if="loading" />

    <template v-else-if="hasData">
      <DiscoveryHeroCarousel :items="heroItems" @open="emit('open', $event)" />
      <DiscoveryFeaturedSection :items="featuredItems" @open="emit('open', $event)" />
      <DiscoveryRankedSection :items="rankedItems" @open="emit('open', $event)" />
    </template>

    <DiscoveryEmptyState v-else @retry="emit('retry')" />
  </main>
</template>
