<script setup lang="ts">
import BookCard from "@/components/book/BookCard.vue";
import type { BookshelfBook } from "@/utils/bookshelf";

defineProps<{
  book: BookshelfBook;
  showProgress: boolean;
  isManageMode: boolean;
  isSelected: boolean;
}>();

const emit = defineEmits<{
  open: [book: BookshelfBook];
  delete: [book: BookshelfBook];
}>();
</script>

<template>
  <div class="relative">
    <BookCard
      :book="book"
      :show-progress="showProgress"
      :manage-mode="isManageMode"
      :selected="isSelected"
      :cache-percent="book.cachePercent"
      :is-fully-cached="book.isFullyCached"
      @click="emit('open', book)"
      @delete="emit('delete', book)"
    />
    <div
      v-if="book.sourceCount > 1 && !isManageMode"
      class="absolute -top-1 -right-1 min-w-[1.25rem] h-5 px-1 rounded-full bg-primary/20 backdrop-blur text-primary text-[10px] font-bold flex items-center justify-center ring-2 ring-background z-10 scale-90 sm:scale-100"
    >
      {{ book.sourceCount }}
    </div>
  </div>
</template>
