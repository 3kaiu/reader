import {
  exportDictionary,
  importDictionary,
} from '@/api/decoder'
import type { DictionaryEntry } from '@/types/decoder'
import { getImportBatchStatus } from '@/utils/batchMutation'
import {
  parseImportedDecoderEntriesText,
  toDecoderTransferEntry,
} from '@/utils/decoderDictionary'
import type {
  ImportDecoderEntriesResult,
  ImportDictionaryEntriesApiResult,
} from '../types'

interface DecoderDictionaryTransferHelpers {
  loadEntries: (force?: boolean) => Promise<DictionaryEntry[]>
}

export function createDecoderDictionaryTransferActions(
  helpers: DecoderDictionaryTransferHelpers,
) {
  async function exportEntries(selectedEntries?: DictionaryEntry[]) {
    const sourceEntries =
      selectedEntries && selectedEntries.length > 0
        ? selectedEntries
        : (await exportDictionary()).entries || []

    return sourceEntries.map(toDecoderTransferEntry)
  }

  async function importEntries(
    entriesToImport: DictionaryEntry[],
  ): Promise<ImportDictionaryEntriesApiResult> {
    const response = await importDictionary(entriesToImport)
    if (response.success) {
      await helpers.loadEntries(true)
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
    exportEntries,
    importEntries,
    importEntriesFromText,
  }
}
