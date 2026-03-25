<script setup lang="ts">
import { X } from "lucide-vue-next";

defineProps<{
  availableSources: string[];
  selectedSources: Set<string>;
}>();

const emit = defineEmits<{
  (e: "toggle-source", source: string): void;
  (e: "clear"): void;
}>();
</script>

<template>
  <div
    class="flex flex-wrap gap-2 mb-4 px-1 animate-in fade-in slide-in-from-bottom-2 duration-300 delay-150"
  >
    <button
      v-for="source in availableSources"
      :key="source"
      class="px-3 py-1.5 rounded-full text-xs font-medium transition-all border"
      :class="
        selectedSources.has(source)
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/50 text-muted-foreground border-transparent hover:bg-muted hover:text-foreground'
      "
      @click="emit('toggle-source', source)"
    >
      {{ source }}
    </button>
    <button
      v-if="selectedSources.size > 0"
      class="px-3 py-1.5 rounded-full text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
      @click="emit('clear')"
    >
      <X class="w-3 h-3" />
      清除筛选
    </button>
  </div>
</template>
