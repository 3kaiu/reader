<script setup lang="ts">
import { ArrowLeft, Trash2 } from "lucide-vue-next";
import { Button } from "@/components/ui/button";

defineProps<{
  canClearCache: boolean;
}>();

const emit = defineEmits<{
  back: [];
  clearCache: [];
}>();
</script>

<template>
  <header class="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border/40">
    <div class="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <button
          class="w-8 h-8 rounded-full hover:bg-secondary flex items-center justify-center transition-colors"
          @click="emit('back')"
        >
          <ArrowLeft class="h-4 w-4 text-muted-foreground" />
        </button>
        <span class="font-medium text-sm">本地 AI 模型</span>
      </div>

      <Button
        v-if="canClearCache"
        variant="ghost"
        size="sm"
        class="h-8 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
        @click="emit('clearCache')"
      >
        <Trash2 class="h-3.5 w-3.5 mr-1.5" />
        清理缓存
      </Button>
    </div>
  </header>
</template>
