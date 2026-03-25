export const DECODER_ROUTES = {
  decode: '/decode',
  dictionary: '/dictionary',
  dictionaryImport: '/dictionary/import',
  dictionaryExport: '/dictionary/export',
  dictionaryConfirm: '/dictionary/confirm',
  dictionaryBatch: '/dictionary/batch',
  health: '/health',
  dictionaryEntry(entryId: string) {
    return `/dictionary/${encodeURIComponent(entryId)}`
  },
  bookState(bookId: string) {
    return `/book/${encodeURIComponent(bookId)}/state`
  },
}
