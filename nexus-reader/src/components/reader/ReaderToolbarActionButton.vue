<script setup lang="ts">
defineProps<{
  label: string
  activeClass?: string
  isActive?: boolean
  showIndicator?: boolean
  indicatorClass?: string
}>()

const emit = defineEmits<{
  click: []
  contextmenu: [event: MouseEvent]
}>()
</script>

<template>
  <button
    class="reader-toolbar-item group relative"
    :class="isActive ? activeClass : ''"
    @click="emit('click')"
    @contextmenu.prevent="emit('contextmenu', $event)"
  >
    <div
      class="reader-toolbar-item-icon group-hover:scale-110 group-active:scale-95 transition-transform"
    >
      <slot name="icon" />
      <span
        v-if="showIndicator"
        class="absolute top-1 right-1 w-2 h-2 rounded-full animate-pulse"
        :class="indicatorClass"
      />
    </div>
    <span class="reader-toolbar-item-label">{{ label }}</span>
  </button>
</template>
