<script setup lang="ts">
import { X } from "lucide-vue-next";
import type { DecodedEntity } from "@/types/decoder";

defineProps<{
  entity: DecodedEntity;
  sourceName: string;
}>();

const emit = defineEmits<{
  close: [];
}>();
</script>

<template>
  <div class="flex items-start justify-between mb-3">
    <div class="flex items-center gap-2">
      <span class="text-lg font-bold text-primary">{{ entity.original }}</span>
      <span class="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
        {{ sourceName }}
      </span>
    </div>
    <button
      class="p-1 hover:bg-muted rounded transition-colors"
      @click="emit('close')"
    >
      <X class="w-4 h-4" />
    </button>
  </div>
</template>
