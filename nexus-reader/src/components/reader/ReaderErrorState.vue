<script setup lang="ts">
defineProps<{
  error: string;
}>();

const emit = defineEmits<{
  openSourcePicker: [];
}>();
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-6 z-40 relative">
    <div class="text-center max-w-sm">
      <h2 class="text-lg font-semibold mb-2">加载失败</h2>
      <p class="text-sm mb-6 opacity-60">{{ error }}</p>
      <button
        class="w-full py-3 px-6 rounded-xl bg-primary/10 hover:bg-primary/20"
        @click="emit('openSourcePicker')"
      >
        查看书源说明
      </button>
    </div>
  </div>
</template>
