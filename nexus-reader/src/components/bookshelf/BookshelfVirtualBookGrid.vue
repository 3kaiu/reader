<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import type { BookshelfBook } from "@/utils/bookshelf";
import type { BookshelfVirtualizer } from "./types";
import BookshelfBookGrid from "./BookshelfBookGrid.vue";

defineProps<{
  showProgress: boolean;
  isManageMode: boolean;
  selectedBooks: Set<string>;
  bindVirtualContainerRef: (element: Element | ComponentPublicInstance | null) => void;
  virtualizer: BookshelfVirtualizer;
  getVirtualRowItems: (rowIndex: number) => BookshelfBook[];
}>();

const emit = defineEmits<{
  open: [book: BookshelfBook];
  delete: [book: BookshelfBook];
}>();
</script>

<template>
  <div
    :ref="bindVirtualContainerRef"
    class="h-[600px] overflow-auto mb-8 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200 scrollbar-hide pb-32"
  >
    <div
      :style="{
        height: `${virtualizer.getTotalSize()}px`,
        position: 'relative',
      }"
    >
      <div
        v-for="virtualRow in virtualizer.getVirtualItems()"
        :key="`row-${virtualRow.index}`"
        :style="{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          transform: `translateY(${virtualRow.start}px)`,
        }"
      >
        <BookshelfBookGrid
          :books="getVirtualRowItems(virtualRow.index)"
          :show-progress="showProgress"
          :is-manage-mode="isManageMode"
          :selected-books="selectedBooks"
          class="px-1"
          @open="emit('open', $event)"
          @delete="emit('delete', $event)"
        />
      </div>
    </div>
  </div>
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
