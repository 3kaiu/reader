import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  batchDeleteDictionaryEntries,
  deleteDictionaryEntry,
  exportDictionary,
  getDictionary,
  importDictionary,
  updateDictionary,
} from '@/api/decoder'
import type { DictionaryEntry, DictionaryLevel } from '@/types/decoder'
import {
  buildDecoderEntrySaveInput,
  createDecoderEntryDraft,
  getDecoderEntryBookType,
  groupDecoderEntriesByScope,
  parseImportedDecoderEntriesText,
  toDecoderTransferEntry,
  upsertDictionaryEntries,
  type DecoderEntryDraft,
  type DecoderTransferEntry,
} from '@/utils/decoderDictionary'
import { getImportBatchStatus } from '@/utils/batchMutation'

type DeleteDictionaryEntriesResult = {
  deleted: number
  failed: number
  deletedIds: string[]
  failedIds: string[]
}

export type ImportDecoderEntriesResult = {
  status: 'imported' | 'partial' | 'failed'
  imported: number
  totalCount: number
  skippedCount: number
  errorMsg?: string
}

export type SaveDecoderEntryDraftResult = {
  status: 'saved' | 'invalid' | 'failed'
  entry?: DictionaryEntry
  errorMsg?: string
}

export const useDecoderDictionaryStore = defineStore('decoder-dictionary', () => {
  const entries = ref<DictionaryEntry[]>([])
  const loading = ref(false)
  const loaded = ref(false)

  let loadPromise: Promise<DictionaryEntry[]> | null = null

  const categoryStats = computed(() => ({
    person: entries.value.filter(entry => entry.category === 'person').length,
    company: entries.value.filter(entry => entry.category === 'company').length,
    place: entries.value.filter(entry => entry.category === 'place').length,
    event: entries.value.filter(entry => entry.category === 'event').length,
    organization: entries.value.filter(entry => entry.category === 'organization').length,
  }))

  async function loadEntries(force = false): Promise<DictionaryEntry[]> {
    if (loadPromise) {
      return loadPromise
    }

    if (loaded.value && !force) {
      return entries.value
    }

    loading.value = true
    loadPromise = getDictionary({ level: 'all' })
      .then(response => {
        entries.value = response.entries || []
        loaded.value = true
        return entries.value
      })
      .finally(() => {
        loading.value = false
        loadPromise = null
      })

    return loadPromise
  }

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

    entries.value = upsertDictionaryEntries(entries.value, [response.entry])
    loaded.value = true
    return response.entry
  }

  function createEntryDraft(entry?: Partial<DictionaryEntry> | null): DecoderEntryDraft {
    return createDecoderEntryDraft(entry)
  }

  async function saveEntryDraft(
    draft: Partial<DecoderEntryDraft>,
    existingEntry?: Partial<DictionaryEntry> | null
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

    entries.value = entries.value.filter(existingEntry => existingEntry.id !== entry.id)
    loaded.value = true
    return true
  }

  async function removeEntries(targetEntries: DictionaryEntry[]): Promise<DeleteDictionaryEntriesResult> {
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
      entries.value = entries.value.filter(entry => !deletedIdSet.has(entry.id))
      loaded.value = true
    }

    return {
      deleted,
      failed,
      deletedIds,
      failedIds,
    }
  }

  async function exportEntries(
    selectedEntries?: DictionaryEntry[]
  ): Promise<DecoderTransferEntry[]> {
    const sourceEntries =
      selectedEntries && selectedEntries.length > 0
        ? selectedEntries
        : (await exportDictionary()).entries || []

    return sourceEntries.map(toDecoderTransferEntry)
  }

  async function importEntries(entriesToImport: DictionaryEntry[]) {
    const response = await importDictionary(entriesToImport)
    if (response.success) {
      await loadEntries(true)
    }
    return response
  }

  async function importEntriesFromText(text: string): Promise<ImportDecoderEntriesResult> {
    const parsed = parseImportedDecoderEntriesText(text)
    if (!parsed.success) {
      return {
        status: 'failed',
        imported: 0,
        totalCount: 0,
        skippedCount: 0,
        errorMsg: parsed.error || '导入失败',
      }
    }

    if (parsed.entries.length === 0) {
      return {
        status: 'failed',
        imported: 0,
        totalCount: parsed.totalCount,
        skippedCount: parsed.invalidCount,
        errorMsg: '未找到可导入的有效词条',
      }
    }

    const response = await importEntries(parsed.entries)
    const imported = response.success ? response.imported : 0

    return {
      status: getImportBatchStatus(imported, parsed.totalCount),
      imported,
      totalCount: parsed.totalCount,
      skippedCount: parsed.invalidCount + Math.max(parsed.entries.length - imported, 0),
      errorMsg: response.success ? undefined : '导入失败',
    }
  }

  return {
    entries,
    loading,
    loaded,
    categoryStats,
    loadEntries,
    createEntryDraft,
    saveEntry,
    saveEntryDraft,
    removeEntry,
    removeEntries,
    exportEntries,
    importEntries,
    importEntriesFromText,
  }
})
