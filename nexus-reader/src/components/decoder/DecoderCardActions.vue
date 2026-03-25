<script setup lang="ts">
import { Check, Edit3 } from "lucide-vue-next";

const emit = defineEmits<{
  confirm: [];
  edit: [];
}>();
</script>

<template>
  <div class="mt-3 pt-3 border-t border-border flex gap-2">
    <button
      class="flex-1 py-1.5 text-sm bg-green-500/10 text-green-600 hover:bg-green-500/20 rounded flex items-center justify-center gap-1 transition-colors"
      @click="emit('confirm')"
    >
      <Check class="w-4 h-4" />
      确认
    </button>
    <button
      class="flex-1 py-1.5 text-sm bg-muted hover:bg-muted/80 rounded flex items-center justify-center gap-1 transition-colors"
      @click="emit('edit')"
    >
      <Edit3 class="w-4 h-4" />
      纠错
    </button>
  </div>
</template>
