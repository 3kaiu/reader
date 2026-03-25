<script setup lang="ts">
import { FolderHeart, Trash2 } from "lucide-vue-next";

defineProps<{
  visible: boolean;
  selectedCount: number;
  allBooksSelected: boolean;
}>();

const emit = defineEmits<{
  selectAll: [];
  move: [];
  delete: [];
  exit: [];
}>();
</script>

<template>
  <div
    v-if="visible"
    class="fixed left-4 right-4 z-[60] animate-in slide-in-from-bottom-4 fade-in duration-300 pointer-events-none bottom-8 lg:bottom-auto lg:top-24 lg:left-1/2 lg:-translate-x-1/2 lg:w-max"
  >
    <div
      class="bg-foreground/95 backdrop-blur-2xl text-background px-4 sm:px-6 py-3.5 rounded-2xl sm:rounded-full shadow-[0_20px_50px_rgba(0,0,0,0.3)] flex items-center justify-between pointer-events-auto border border-white/10 max-w-2xl mx-auto"
    >
      <div class="flex items-center gap-2 sm:gap-4">
        <span class="font-bold text-[12px] sm:text-sm whitespace-nowrap"
          >已选 {{ selectedCount }} 本</span
        >
        <div class="h-4 w-px bg-background/20 hidden sm:block"></div>
        <button
          class="h-8 px-3 rounded-lg flex items-center justify-center text-[11px] sm:text-sm font-bold hover:bg-background/10 transition-all active:scale-95 whitespace-nowrap"
          @click="emit('selectAll')"
        >
          {{ allBooksSelected ? "取消" : "全选" }}
        </button>
      </div>

      <div class="flex items-center gap-2 sm:gap-6">
        <button
          class="h-9 px-3 rounded-xl flex items-center gap-1.5 text-[11px] sm:text-sm font-bold text-primary hover:bg-primary/10 transition-all active:scale-95"
          @click="emit('move')"
        >
          <FolderHeart class="h-4 w-4" />
          <span class="hidden sm:inline">移动</span>
        </button>
        <button
          class="h-9 px-3 rounded-xl flex items-center gap-1.5 text-[11px] sm:text-sm font-bold text-red-400 hover:bg-red-400/10 transition-all active:scale-95"
          @click="emit('delete')"
        >
          <Trash2 class="h-4 w-4" />
          <span class="hidden sm:inline">删除</span>
        </button>
        <button
          class="lg:hidden h-8 px-3 rounded-lg text-[11px] font-bold opacity-60 active:bg-background/10"
          @click="emit('exit')"
        >
          退出
        </button>
      </div>
    </div>
  </div>
</template>
