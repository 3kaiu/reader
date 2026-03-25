<script setup lang="ts">
import { Library, Sparkles } from "lucide-vue-next";
import type { BookGroup } from "@/types/group";
import type { BookshelfBook } from "@/utils/bookshelf";
import type { BookshelfVirtualizer } from "./types";
import BookshelfBookGrid from "./BookshelfBookGrid.vue";
import BookshelfEmptyState from "./BookshelfEmptyState.vue";
import BookshelfGroupTabs from "./BookshelfGroupTabs.vue";
import BookshelfLoadingGrid from "./BookshelfLoadingGrid.vue";
import BookshelfVirtualBookGrid from "./BookshelfVirtualBookGrid.vue";

defineProps<{
  loading: boolean;
  booksCount: number;
  nonEmptyGroups: BookGroup[];
  currentGroupId: string | number;
  recentBooks: BookshelfBook[];
  otherBooks: BookshelfBook[];
  showProgress: boolean;
  isManageMode: boolean;
  selectedBooks: Set<string>;
  shouldUseVirtualScroll: boolean;
  bindVirtualContainerRef: (element: Element | null) => void;
  virtualizer: BookshelfVirtualizer;
  getVirtualRowItems: (rowIndex: number) => BookshelfBook[];
}>();

const emit = defineEmits<{
  "update:currentGroupId": [value: string | number];
  open: [book: BookshelfBook];
  delete: [book: BookshelfBook];
  search: [];
}>();
</script>

<template>
  <BookshelfGroupTabs
    v-if="nonEmptyGroups.length > 0"
    :non-empty-groups="nonEmptyGroups"
    :current-group-id="currentGroupId"
    @update:current-group-id="emit('update:currentGroupId', $event)"
  />

  <BookshelfLoadingGrid v-if="loading" />

  <BookshelfEmptyState v-else-if="booksCount === 0" @search="emit('search')" />

  <template v-else>
    <section
      v-if="recentBooks.length > 0"
      class="mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500"
    >
      <div class="flex items-center gap-2 mb-3 px-1">
        <Sparkles class="w-3.5 h-3.5 text-primary" />
        <h2
          class="text-[11px] font-bold text-muted-foreground uppercase tracking-widest"
        >
          继续阅读
        </h2>
      </div>

      <BookshelfBookGrid
        :books="recentBooks"
        :show-progress="showProgress"
        :is-manage-mode="isManageMode"
        :selected-books="selectedBooks"
        @open="emit('open', $event)"
        @delete="emit('delete', $event)"
      />
    </section>

    <div v-if="otherBooks.length > 0" class="mb-4 px-1 flex items-center gap-2">
      <Library class="w-3.5 h-3.5 text-muted-foreground" />
      <h2
        class="text-[11px] font-bold text-muted-foreground uppercase tracking-widest"
      >
        全部书籍
        <span
          class="text-[10px] font-normal text-muted-foreground/60 normal-case ml-1"
        >
          ({{ otherBooks.length }})
        </span>
      </h2>
    </div>

    <BookshelfVirtualBookGrid
      v-if="shouldUseVirtualScroll"
      :show-progress="showProgress"
      :is-manage-mode="isManageMode"
      :selected-books="selectedBooks"
      :bind-virtual-container-ref="bindVirtualContainerRef"
      :virtualizer="virtualizer"
      :get-virtual-row-items="getVirtualRowItems"
      @open="emit('open', $event)"
      @delete="emit('delete', $event)"
    />

    <BookshelfBookGrid
      v-else
      :books="otherBooks"
      :show-progress="showProgress"
      :is-manage-mode="isManageMode"
      :selected-books="selectedBooks"
      class="animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200"
      @open="emit('open', $event)"
      @delete="emit('delete', $event)"
    />
  </template>
</template>
