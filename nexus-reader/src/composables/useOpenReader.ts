import { useRouter } from 'vue-router'
import type { SaveBookInput } from '@/api/library'
import { useLibraryStore, type EnsureBookResult } from '@/stores/library'
import { useReaderStore } from '@/stores/reader'
import type { Book } from '@/types/book'
import { buildReaderRouteLocation } from '@/utils/readerRoute'

type ReaderOpenInput = SaveBookInput | Book

type OpenReaderOptions = {
  ensureOnShelf?: boolean
  preload?: boolean
}

type OpenReaderResult = {
  ensureResult?: EnsureBookResult
  navigated: boolean
}

function toReaderSessionBook(input: ReaderOpenInput, ensuredBook?: Book): Book {
  return {
    ...(ensuredBook || {}),
    ...input,
    author: input.author ?? ensuredBook?.author ?? '',
  }
}

export function useOpenReader() {
  const router = useRouter()
  const libraryStore = useLibraryStore()
  const readerStore = useReaderStore()

  async function openReader(
    book: ReaderOpenInput,
    options: OpenReaderOptions = {},
  ): Promise<OpenReaderResult> {
    let ensureResult: EnsureBookResult | undefined
    let navigationTarget: ReaderOpenInput | Book = book

    if (options.ensureOnShelf) {
      ensureResult = await libraryStore.ensureBook(book)
      if (ensureResult.status === 'failed') {
        return {
          ensureResult,
          navigated: false,
        }
      }

      if (ensureResult.book) {
        navigationTarget = ensureResult.book
      }
    }

    if (options.preload) {
      await readerStore.ensureReaderSession(
        toReaderSessionBook(book, ensureResult?.book),
      )
    }

    await router.push(buildReaderRouteLocation(navigationTarget))

    return {
      ensureResult,
      navigated: true,
    }
  }

  return {
    openReader,
  }
}
