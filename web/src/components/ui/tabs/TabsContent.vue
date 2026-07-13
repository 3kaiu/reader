<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { inject, computed } from 'vue'
import type { Ref } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  value: string
  class?: HTMLAttributes['class']
}>()

const activeTab = inject<Ref<string>>('tabs-active')

const isActive = computed(() => activeTab?.value === props.value)
</script>

<template>
  <div
    v-if="isActive"
    role="tabpanel"
    :class="
      cn(
        'mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        props.class
      )
    "
  >
    <slot />
  </div>
</template>
