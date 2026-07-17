<script setup lang="ts">
/**
 * Inline marker for known aliases in the reading view.
 *
 * Renders known mappings as subtle visual annotations:
 * - Confirmed: dashed underline + hover tooltip
 * - Pending AI suggestion: dotted underline (different color)
 * - High confidence: ruby-style annotation with canonical name
 */
import type { AliasMapping } from './composables/types'

defineProps<{
  mappings: AliasMapping[]
}>()
</script>

<template>
  <span class="ai-marker-container" v-if="mappings.length > 0">
    <span
      v-for="m in mappings"
      :key="m.alias"
      class="ai-inline-marker"
      :class="{
        'ai-confirmed': m.confirmed,
        'ai-pending': !m.confirmed && m.confidence > 0.7,
        'ai-suggestion': !m.confirmed && m.confidence <= 0.7,
      }"
      :title="`${m.alias} → ${m.canonical} (${(m.confidence * 100).toFixed(0)}%)`"
    >
      <ruby>
        {{ m.alias }}
        <rt v-if="m.confirmed">{{ m.canonical }}</rt>
      </ruby>
    </span>
  </span>
</template>

<style scoped>
.ai-inline-marker {
  cursor: help;
  position: relative;
}
.ai-confirmed {
  text-decoration: underline;
  text-decoration-style: dashed;
  text-underline-offset: 2px;
  text-decoration-color: hsl(var(--primary));
}
.ai-confirmed ruby rt {
  font-size: 0.65em;
  color: hsl(var(--primary));
}
.ai-pending {
  text-decoration: underline;
  text-decoration-style: dotted;
  text-underline-offset: 2px;
  text-decoration-color: hsl(var(--warning));
}
.ai-suggestion {
  text-decoration: underline;
  text-decoration-style: wavy;
  text-underline-offset: 2px;
  text-decoration-color: hsl(var(--muted-foreground));
}
</style>
