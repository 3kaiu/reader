<script setup lang="ts">
/**
 * BookCard - shadcn-vue 风格
 */
import { useBookCardView } from '@/composables/useBookCardView'
import BookCardMedia from '@/components/book/book-card/BookCardMedia.vue'
import BookCardMenu from '@/components/book/book-card/BookCardMenu.vue'
import BookCardMeta from '@/components/book/book-card/BookCardMeta.vue'
import BookCardStatusOverlays from '@/components/book/book-card/BookCardStatusOverlays.vue'
import type { Book } from '@/types/book'

const props = withDefaults(
  defineProps<{
    book: Book
    showProgress?: boolean
    manageMode?: boolean
    selected?: boolean
    cachePercent?: number
    isFullyCached?: boolean
  }>(),
  {
    showProgress: true,
    manageMode: false,
    selected: false,
    cachePercent: 0,
    isFullyCached: false,
  }
)

const emit = defineEmits<{
  click: [book: Book]
  delete: [book: Book]
}>()

const { showMenu, progress, unreadCount, coverUrl, toggleMenu, handleDelete } = useBookCardView({
  book: props.book,
  onDelete: book => emit('delete', book),
})
</script>

<template>
  <div
    class="group cursor-pointer relative select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl interactive"
    @click="emit('click', book)"
    role="button"
    tabindex="0"
    @keydown.enter="emit('click', book)"
    @keydown.space.prevent="emit('click', book)"
    :aria-label="`打开书籍 ${book.name}`"
  >
    <!-- 封面容器 -->
    <div
      class="relative aspect-[2/3] rounded-xl overflow-hidden bg-muted shadow-premium dark:shadow-none transition-all duration-300 ease-out group-hover:shadow-[0_8px_24px_rgba(0,0,0,0.12)] dark:group-hover:shadow-[0_8px_32px_rgba(0,0,0,0.5)] ring-1 ring-black/5 dark:ring-white/10"
      :class="{ 'ring-2 ring-primary ring-offset-2 ring-offset-background': selected }"
    >
      <BookCardMedia
        :book-name="book.name"
        :cover-url="coverUrl"
        :manage-mode="manageMode"
        :selected="selected"
      />

      <BookCardStatusOverlays
        :unread-count="unreadCount"
        :manage-mode="manageMode"
        :cache-percent="cachePercent"
        :is-fully-cached="isFullyCached"
        :show-progress="showProgress"
        :progress="progress"
      />

      <BookCardMenu
        :manage-mode="manageMode"
        :show-menu="showMenu"
        @toggle-menu="toggleMenu"
        @delete="handleDelete"
      />
    </div>

    <BookCardMeta :name="book.name" :author="book.author" :progress="progress" />
  </div>
</template>
