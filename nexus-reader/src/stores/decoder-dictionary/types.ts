import type { ComputedRef, Ref } from 'vue'
import type { DictionaryEntry, DictionaryLevel } from '@/types/decoder'
import type {
  DecoderEntryDraft,
  DecoderTransferEntry,
} from '@/utils/decoderDictionary'

export type DeleteDictionaryEntriesResult = {
  deleted: number
  failed: number
  deletedIds: string[]
  failedIds: string[]
}

export type ImportDictionaryEntriesApiResult = {
  success: boolean
  imported: number
  total: number
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

export type DecoderDictionaryCategoryStats = {
  person: number
  company: number
  place: number
  event: number
  organization: number
}

export interface DecoderDictionaryStoreState {
  entries: Ref<DictionaryEntry[]>
  loading: Ref<boolean>
  loaded: Ref<boolean>
}

export interface DecoderDictionaryStoreView {
  categoryStats: ComputedRef<DecoderDictionaryCategoryStats>
}

export interface DecoderDictionaryStoreActions {
  loadEntries(force?: boolean): Promise<DictionaryEntry[]>
  createEntryDraft(entry?: Partial<DictionaryEntry> | null): DecoderEntryDraft
  saveEntry(options: {
    entry: Partial<DictionaryEntry>
    level?: DictionaryLevel
    bookId?: string
  }): Promise<DictionaryEntry | null>
  saveEntryDraft(
    draft: Partial<DecoderEntryDraft>,
    existingEntry?: Partial<DictionaryEntry> | null
  ): Promise<SaveDecoderEntryDraftResult>
  removeEntry(entry: DictionaryEntry): Promise<boolean>
  removeEntries(targetEntries: DictionaryEntry[]): Promise<DeleteDictionaryEntriesResult>
  exportEntries(selectedEntries?: DictionaryEntry[]): Promise<DecoderTransferEntry[]>
  importEntries(entriesToImport: DictionaryEntry[]): Promise<ImportDictionaryEntriesApiResult>
  importEntriesFromText(text: string): Promise<ImportDecoderEntriesResult>
}
