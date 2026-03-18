/**
 * Reader Store
 *
 * Manages reading state, bookmarks, and progress
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { errorHandler } from '@/utils/unified-utils'
import type { Book, Chapter, ReadingProgress, Bookmark, ReadingSettings } from './types'

export const useReaderStore = defineStore('reader', () => {
  const currentBook = ref<Book | null>(null)
  const currentChapter = ref<Chapter | null>(null)
  const readingProgress = ref<ReadingProgress | null>(null)
  const bookmarks = ref<Bookmark[]>([])
  const readingSettings = ref<ReadingSettings | null>(null)
  const isLoading = ref(false)

  const loadBook = async (bookId: string) => {
    isLoading.value = true
    try {
      // const response = await api.get(`/books/${bookId}`)
      // currentBook.value = response.data
      console.log('Loading book:', bookId)
    } catch (error: unknown) {
      errorHandler.handle(error instanceof Error ? error : String(error), {
        component: 'reader-store',
        operation: 'load-book',
      })
    } finally {
      isLoading.value = false
    }
  }

  const loadChapter = async (chapterId: string) => {
    isLoading.value = true
    try {
      // const response = await api.get(`/chapters/${chapterId}`)
      // currentChapter.value = response.data
      console.log('Loading chapter:', chapterId)
    } catch (error: unknown) {
      errorHandler.handle(error instanceof Error ? error : String(error), {
        component: 'reader-store',
        operation: 'load-chapter',
      })
    } finally {
      isLoading.value = false
    }
  }

  const updateProgress = async (progress: ReadingProgress) => {
    try {
      readingProgress.value = progress
      // await api.put('/reading/progress', progress)
    } catch (error: unknown) {
      errorHandler.handle(error instanceof Error ? error : String(error), {
        component: 'reader-store',
        operation: 'update-progress',
      })
    }
  }

  const addBookmark = async (bookmark: Omit<Bookmark, 'id'>) => {
    try {
      const newBookmark: Bookmark = {
        id: crypto.randomUUID(),
        ...bookmark,
      }
      bookmarks.value.push(newBookmark)
      // await api.post('/bookmarks', newBookmark)
    } catch (error: unknown) {
      errorHandler.handle(error instanceof Error ? error : String(error), {
        component: 'reader-store',
        operation: 'add-bookmark',
      })
    }
  }

  const updateSettings = async (settings: ReadingSettings) => {
    try {
      readingSettings.value = settings
      // await api.put('/reading/settings', settings)
    } catch (error: unknown) {
      errorHandler.handle(error instanceof Error ? error : String(error), {
        component: 'reader-store',
        operation: 'update-settings',
      })
    }
  }

  return {
    currentBook,
    currentChapter,
    readingProgress,
    bookmarks,
    readingSettings,
    isLoading,
    loadBook,
    loadChapter,
    updateProgress,
    addBookmark,
    updateSettings,
  }
})
