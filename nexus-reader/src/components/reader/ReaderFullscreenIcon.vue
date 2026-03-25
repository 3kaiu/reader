<script setup lang="ts">
defineProps<{
  isFullscreen: boolean
}>()
</script>

<template>
  <svg
    v-if="!isFullscreen"
    class="w-5 h-5"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
    />
  </svg>
  <svg
    v-else
    class="w-5 h-5"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      d="M9 9V4H4m0 0l5 5M9 20v-5H4m0 0l5-5m11 0l-5-5m5 0v5h-5m5 10l-5-5m5 0v5h-5"
    />
  </svg>
</template>
