import {
  batchDeleteDictionaryEntries,
  deleteDictionaryEntry,
  updateDictionary,
} from '@/api/decoder'
import type { DictionaryEntry, DictionaryLevel } from '@/types/decoder'
import {
  buildDecoderEntrySaveInput,
  createDecoderEntryDraft,
  getDecoderEntryBookType,
  groupDecoderEntriesByScope,
  upsertDictionaryEntries,
  type DecoderEntryDraft,
} from '@/utils/decoderDictionary'
import type {
  DeleteDictionaryEntriesResult,
  SaveDecoderEntryDraftResult,
} from '../types'

interface DecoderDictionaryEntriesHelpers {
  entries: () => DictionaryEntry[]
  applyEntries: (nextEntries: DictionaryEntry[]) => void
}

export function createDecoderDictionaryEntryActions(
  helpers: DecoderDictionaryEntriesHelpers,
) {
  async function saveEntry(options: {
    entry: Partial<DictionaryEntry>
    level?: DictionaryLevel
    bookId?: string
  }): Promise<DictionaryEntry | null> {
    const targetLevel =
      options.level === 'book' && !options.bookId ? 'global' : options.level || 'global'
    const response = await updateDictionary({
      entry: options.entry,
      level: targetLevel,
      bookId: options.bookId,
      promote: false,
    })

    if (!response.success || !response.entry) {
      return null
    }

    helpers.applyEntries(upsertDictionaryEntries(helpers.entries(), [response.entry]))
    return response.entry
  }

  function createEntryDraft(entry?: Partial<DictionaryEntry> | null): DecoderEntryDraft {
    return createDecoderEntryDraft(entry)
  }

  async function saveEntryDraft(
    draft: Partial<DecoderEntryDraft>,
    existingEntry?: Partial<DictionaryEntry> | null,
  ): Promise<SaveDecoderEntryDraftResult> {
    const input = buildDecoderEntrySaveInput(draft, existingEntry)
    if (!input) {
      return {
        status: 'invalid',
        errorMsg: '请填写加密词和真实指代',
      }
    }

    const entry = await saveEntry(input)
    if (!entry) {
      return {
        status: 'failed',
        errorMsg: '保存失败',
      }
    }

    return {
      status: 'saved',
      entry,
    }
  }

  async function removeEntry(entry: DictionaryEntry): Promise<boolean> {
    const response = await deleteDictionaryEntry(entry.id, {
      level: entry.level,
      bookId: entry.bookId,
      category: getDecoderEntryBookType(entry),
    })

    if (!response.success) {
      return false
    }

    helpers.applyEntries(
      helpers.entries().filter(existingEntry => existingEntry.id !== entry.id),
    )
    return true
  }

  async function removeEntries(
    targetEntries: DictionaryEntry[],
  ): Promise<DeleteDictionaryEntriesResult> {
    const groupedRequests = groupDecoderEntriesByScope(targetEntries)
    let deleted = 0
    let failed = 0
    const deletedIds: string[] = []
    const failedIds: string[] = []

    for (const request of groupedRequests) {
      const response = await batchDeleteDictionaryEntries(request)
      deleted += response.deleted
      failed += response.failed
      deletedIds.push(...response.details.deletedIds)
      failedIds.push(...response.details.failedIds)
    }

    if (deletedIds.length > 0) {
      const deletedIdSet = new Set(deletedIds)
      helpers.applyEntries(
        helpers.entries().filter(entry => !deletedIdSet.has(entry.id)),
      )
    }

    return {
      deleted,
      failed,
      deletedIds,
      failedIds,
    }
  }

  return {
    createEntryDraft,
    saveEntry,
    saveEntryDraft,
    removeEntry,
    removeEntries,
  }
}
