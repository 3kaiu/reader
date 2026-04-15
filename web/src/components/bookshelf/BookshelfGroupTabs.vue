<script setup lang="ts">
import type { BookGroup } from '@/types/group'

defineProps<{
  nonEmptyGroups: BookGroup[]
  currentGroupId: string | number
}>()

const emit = defineEmits<{
  'update:currentGroupId': [value: string | number]
}>()
</script>

<template>
  <section class="mb-3 -mx-1 px-1 overflow-x-auto scrollbar-hide flex items-center gap-2 py-1">
    <button
      class="shrink-0 px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-200"
      :class="
        currentGroupId === 'all'
          ? 'bg-primary text-primary-foreground shadow-md'
          : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
      "
      @click="emit('update:currentGroupId', 'all')"
    >
      全部
    </button>
    <button
      v-for="group in nonEmptyGroups"
      :key="group.groupId"
      class="shrink-0 px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-200"
      :class="
        currentGroupId === group.groupId
          ? 'bg-primary text-primary-foreground shadow-md'
          : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
      "
      @click="emit('update:currentGroupId', group.groupId)"
    >
      {{ group.groupName }}
    </button>
  </section>
</template>

<style scoped>
.scrollbar-hide {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
</style>
