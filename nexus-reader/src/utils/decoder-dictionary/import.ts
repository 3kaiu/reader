import type { DictionaryEntry } from '@/types/decoder'
import {
  isDecoderBookType,
  isDecoderDictionaryLevel,
  isDecoderEntityCategory,
  isDecoderEntrySource,
} from './guards'
import type {
  DecoderTransferEntry,
  ParsedDecoderDictionaryImport,
} from './types'

function parseDecoderAliases(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const aliases = value
      .map(item => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean)
    return aliases.length > 0 ? aliases : undefined
  }

  if (typeof value === 'string') {
    const aliases = value
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)
    return aliases.length > 0 ? aliases : undefined
  }

  return undefined
}

export function normalizeImportedDecoderEntry(
  input: unknown,
  now = Date.now()
): { entry: DictionaryEntry | null; error?: string } {
  if (!input || typeof input !== 'object') {
    return { entry: null, error: '词条必须是对象' }
  }

  const raw = input as Partial<DecoderTransferEntry>
  const original = typeof raw.original === 'string' ? raw.original.trim() : ''
  const real = typeof raw.real === 'string' ? raw.real.trim() : ''

  if (!original || !real) {
    return { entry: null, error: '缺少 original 或 real' }
  }

  if (!isDecoderEntityCategory(raw.category)) {
    return { entry: null, error: 'category 不合法' }
  }

  const level = isDecoderDictionaryLevel(raw.level) ? raw.level : 'global'
  const bookId = typeof raw.bookId === 'string' && raw.bookId.trim() ? raw.bookId.trim() : undefined
  const bookType = isDecoderBookType(raw.bookType)
    ? raw.bookType
    : raw.categoryTags?.find(tag => isDecoderBookType(tag))

  if (level === 'book' && !bookId) {
    return { entry: null, error: 'book 级词条缺少 bookId' }
  }

  if (level === 'category' && !bookType) {
    return { entry: null, error: 'category 级词条缺少 bookType' }
  }

  const entry: DictionaryEntry = {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : crypto.randomUUID(),
    original,
    real,
    category: raw.category,
    aliases: parseDecoderAliases(raw.aliases),
    description: typeof raw.description === 'string' ? raw.description.trim() || undefined : undefined,
    level,
    categoryTags: level === 'category' && bookType ? [bookType] : undefined,
    bookId: level === 'book' ? bookId : undefined,
    confidence: typeof raw.confidence === 'number' ? raw.confidence : 100,
    confirmCount: typeof raw.confirmCount === 'number' ? raw.confirmCount : 0,
    source: isDecoderEntrySource(raw.source) ? raw.source : 'user',
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : now,
    updatedAt: now,
  }

  return { entry }
}

export function parseImportedDecoderEntries(
  input: unknown,
  now = Date.now()
): { entries: DictionaryEntry[]; invalidCount: number } | null {
  if (!Array.isArray(input)) {
    return null
  }

  const entries: DictionaryEntry[] = []
  let invalidCount = 0

  for (const item of input) {
    const { entry } = normalizeImportedDecoderEntry(item, now)
    if (entry) {
      entries.push(entry)
    } else {
      invalidCount += 1
    }
  }

  return {
    entries,
    invalidCount,
  }
}

export function parseImportedDecoderEntriesText(
  text: string,
  now = Date.now()
): ParsedDecoderDictionaryImport {
  const trimmed = text.trim()
  if (!trimmed) {
    return {
      success: false,
      entries: [],
      totalCount: 0,
      invalidCount: 0,
      error: '文件内容为空',
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return {
      success: false,
      entries: [],
      totalCount: 0,
      invalidCount: 0,
      error: '无效的词典格式',
    }
  }

  const importedEntries = parseImportedDecoderEntries(parsed, now)
  if (!importedEntries) {
    return {
      success: false,
      entries: [],
      totalCount: 0,
      invalidCount: 0,
      error: '无效的词典格式',
    }
  }

  return {
    success: true,
    entries: importedEntries.entries,
    totalCount: importedEntries.entries.length + importedEntries.invalidCount,
    invalidCount: importedEntries.invalidCount,
  }
}
