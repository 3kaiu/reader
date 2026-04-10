<script setup lang="ts">
interface Props {
  fontWeights: readonly number[]
  selectedWeight: number
}

defineProps<Props>()

const emit = defineEmits<{
  select: [weight: number]
}>()
</script>

<template>
  <section>
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-sm font-medium">字重</h3>
      <span class="text-sm text-muted-foreground">{{ selectedWeight }}</span>
    </div>
    <div class="flex gap-2">
      <button
        v-for="weight in fontWeights"
        :key="weight"
        class="flex-1 py-2 rounded-lg border transition-all text-sm active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        :class="
          selectedWeight === weight
            ? 'border-primary bg-primary/10 text-primary'
            : 'border-border hover:border-primary/50'
        "
        :style="{ fontWeight: weight }"
        :aria-label="`字重${weight}`"
        :aria-pressed="selectedWeight === weight"
        @click="emit('select', weight)"
      >
        {{ weight }}
      </button>
    </div>
  </section>
</template>
