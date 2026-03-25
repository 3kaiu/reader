import { decoderFetch } from './client'
import { DECODER_ROUTES } from './routes'
import type {
  BatchDeleteDictionaryEntriesPayload,
  BatchDeleteDictionaryEntriesResponse,
  ConfirmEntryPayload,
  ConfirmEntryResponse,
  DecoderDictionaryQuery,
  DeleteDictionaryEntryParams,
  DeleteDictionaryEntryResponse,
  DictionaryEntriesResponse,
  ImportDictionaryResponse,
  UpdateDictionaryPayload,
  UpdateDictionaryResponse,
} from './types'
import type { DictionaryEntry } from '@/types/decoder'

export async function getDictionary(
  params?: DecoderDictionaryQuery,
): Promise<DictionaryEntriesResponse> {
  return decoderFetch<DictionaryEntriesResponse>(DECODER_ROUTES.dictionary, {
    method: 'GET',
    params,
  })
}

export async function updateDictionary(
  data: UpdateDictionaryPayload,
): Promise<UpdateDictionaryResponse> {
  return decoderFetch<UpdateDictionaryResponse>(DECODER_ROUTES.dictionary, {
    method: 'PUT',
    body: data,
  })
}

export async function importDictionary(
  entries: DictionaryEntry[],
): Promise<ImportDictionaryResponse> {
  return decoderFetch<ImportDictionaryResponse>(DECODER_ROUTES.dictionaryImport, {
    method: 'POST',
    body: { entries },
  })
}

export async function exportDictionary(): Promise<DictionaryEntriesResponse> {
  return decoderFetch<DictionaryEntriesResponse>(DECODER_ROUTES.dictionaryExport, {
    method: 'GET',
  })
}

export async function confirmEntry(
  data: ConfirmEntryPayload,
): Promise<ConfirmEntryResponse> {
  return decoderFetch<ConfirmEntryResponse>(DECODER_ROUTES.dictionaryConfirm, {
    method: 'POST',
    body: data,
  })
}

export async function deleteDictionaryEntry(
  entryId: string,
  params?: DeleteDictionaryEntryParams,
): Promise<DeleteDictionaryEntryResponse> {
  return decoderFetch<DeleteDictionaryEntryResponse>(
    DECODER_ROUTES.dictionaryEntry(entryId),
    {
      method: 'DELETE',
      params,
    },
  )
}

export async function batchDeleteDictionaryEntries(
  data: BatchDeleteDictionaryEntriesPayload,
): Promise<BatchDeleteDictionaryEntriesResponse> {
  return decoderFetch<BatchDeleteDictionaryEntriesResponse>(
    DECODER_ROUTES.dictionaryBatch,
    {
      method: 'DELETE',
      body: data,
    },
  )
}
