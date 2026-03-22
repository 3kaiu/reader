import { computed } from 'vue'
import { useReaderStore } from '@/stores/reader'
import type { Book } from '@/types/book'

export function useBookSourcePickerView() {
  const readerStore = useReaderStore()

  const currentBook = computed<Book | null>(() => readerStore.currentBook)

  return {
    currentBook,
  }
}
