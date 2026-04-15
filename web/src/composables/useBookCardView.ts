import { computed, ref } from 'vue'
import type { Book } from '@/types/book'

export function useBookCardView(options: { book: Book; onDelete: (book: Book) => void }) {
  const showMenu = ref(false)

  const progress = computed(() => {
    if (!options.book.totalChapterNum) {
      return 0
    }

    return Math.round(((options.book.durChapterIndex || 0) / options.book.totalChapterNum) * 100)
  })

  const unreadCount = computed(() => {
    if (!options.book.totalChapterNum) {
      return 0
    }

    return Math.max(options.book.totalChapterNum - 1 - (options.book.durChapterIndex || 0), 0)
  })

  const coverUrl = computed(() => options.book.coverUrl || '')

  function toggleMenu() {
    showMenu.value = !showMenu.value
  }

  function closeMenu() {
    showMenu.value = false
  }

  function handleDelete(event: Event) {
    event.stopPropagation()
    closeMenu()
    options.onDelete(options.book)
  }

  return {
    showMenu,
    progress,
    unreadCount,
    coverUrl,
    toggleMenu,
    closeMenu,
    handleDelete,
  }
}
