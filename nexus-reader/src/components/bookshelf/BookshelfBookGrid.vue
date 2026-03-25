<script setup lang="ts">
import type { BookshelfBook } from "@/utils/bookshelf";
import BookshelfBookTile from "./BookshelfBookTile.vue";

const props = defineProps<{
  books: BookshelfBook[];
  showProgress: boolean;
  isManageMode: boolean;
  selectedBooks: Set<string>;
}>();

const emit = defineEmits<{
  open: [book: BookshelfBook];
  delete: [book: BookshelfBook];
}>();

function isSelected(book: BookshelfBook) {
  return props.selectedBooks.has(book.id || "");
}
</script>

<template>
  <div
    class="grid grid-cols-2 min-[480px]:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6"
  >
    <BookshelfBookTile
      v-for="book in books"
      :key="book.id || book.bookUrl"
      :book="book"
      :show-progress="showProgress"
      :is-manage-mode="isManageMode"
      :is-selected="isSelected(book)"
      @open="emit('open', $event)"
      @delete="emit('delete', $event)"
    />
  </div>
</template>
