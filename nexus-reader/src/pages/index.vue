<script setup lang="ts">
/**
 * 首页/书架 - Neo-Modern Redesign
 */
import { computed, type ComponentPublicInstance } from 'vue'
import { useBookshelfView } from '@/composables/useBookshelfView'
import { useBookshelfVirtualGrid } from '@/composables/useBookshelfVirtualGrid'
import MoveBookDialog from '@/components/book/MoveBookDialog.vue'
import BookshelfContent from '@/components/bookshelf/BookshelfContent.vue'
import BookshelfHeaderBar from '@/components/bookshelf/BookshelfHeaderBar.vue'
import BookshelfManageBar from '@/components/bookshelf/BookshelfManageBar.vue'
const {
  isDark,
  toggleDark,
  showProgress,
  menuOpen,
  isDesktop,
  menuGroups,
  loading,
  books,
  groups,
  nonEmptyGroups,
  currentGroupId,
  recentBooks,
  otherBooks,
  hasBooks,
  allBooksSelected,
  isManageMode,
  selectedBooks,
  selectAll,
  toggleManageMode,
  showMoveDialog,
  openBook,
  batchDelete,
  handleMoveConfirm,
  handleDelete,
  navigateTo,
  goSearch,
} = useBookshelfView()
const { virtualContainerRef, shouldUseVirtualScroll, virtualizer, getVirtualRowItems } =
  useBookshelfVirtualGrid(computed(() => otherBooks.value))

function bindVirtualContainerRef(element: Element | ComponentPublicInstance | null) {
  virtualContainerRef.value = element instanceof HTMLElement ? element : null
}
</script>

<template>
  <div>
    <!-- 精致背景装饰 (Subtle background aura) -->
    <div class="fixed inset-0 pointer-events-none overflow-hidden -z-10">
      <div
        class="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[120px]"
      />
      <div
        class="absolute top-[20%] -right-[10%] w-[30%] h-[30%] bg-blue-500/5 rounded-full blur-[100px]"
      />
    </div>

    <!-- 顶部状态栏占位 (iOS style) -->
    <div class="h-safe-top" />

    <BookshelfHeaderBar
      v-model:menu-open="menuOpen"
      :is-dark="isDark"
      :show-discovery="false"
      :has-books="hasBooks"
      :is-manage-mode="isManageMode"
      :is-desktop="isDesktop"
      :menu-groups="menuGroups"
      @toggle-dark="toggleDark()"
      @search="goSearch()"
      @toggle-manage-mode="toggleManageMode()"
      @navigate="navigateTo"
    />

    <main class="px-4 sm:px-6 max-w-7xl mx-auto pt-[62px] pb-12">
      <BookshelfContent
        v-model:current-group-id="currentGroupId"
        :loading="loading"
        :books-count="books.length"
        :non-empty-groups="nonEmptyGroups"
        :recent-books="recentBooks"
        :other-books="otherBooks"
        :show-progress="showProgress"
        :is-manage-mode="isManageMode"
        :selected-books="selectedBooks"
        :should-use-virtual-scroll="shouldUseVirtualScroll"
        :bind-virtual-container-ref="bindVirtualContainerRef"
        :virtualizer="virtualizer"
        :get-virtual-row-items="getVirtualRowItems"
        @open="openBook"
        @delete="handleDelete"
        @search="goSearch"
      />
    </main>

    <BookshelfManageBar
      :visible="isManageMode"
      :selected-count="selectedBooks.size"
      :all-books-selected="allBooksSelected"
      @select-all="selectAll"
      @move="showMoveDialog = true"
      @delete="batchDelete"
      @exit="toggleManageMode(false)"
    />

    <!-- Modals -->
    <MoveBookDialog
      v-model:open="showMoveDialog"
      :groups="groups"
      :selected-count="selectedBooks.size"
      @confirm="handleMoveConfirm"
    />
  </div>
</template>

<style scoped>
.h-safe-top {
  height: env(safe-area-inset-top, 0px);
}

.pb-safe-bottom {
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
</style>
