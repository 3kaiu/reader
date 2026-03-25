<script setup lang="ts">
defineProps<{
  formattedTime: string
}>()
</script>

<template>
  <div class="fixed top-4 right-6 text-xs opacity-30 font-mono pointer-events-none z-50">
    {{ formattedTime }}
  </div>
</template>
