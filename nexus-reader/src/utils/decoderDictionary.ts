import type {
  BookType,
  DictionaryEntry,
  DictionaryLevel,
  EntityCategory,
  EntrySource,
} from '@/types/decoder'

export type DecoderTransferEntry = {
  id?: string
  original: string
  real: string
  category: EntityCategory
  aliases?: string[]
  description?: string
  level?: DictionaryLevel
  bookId?: string
  bookType?: BookType
  categoryTags?: BookType[]
  confidence?: number
  confirmCount?: number
  source?: EntrySource
  createdAt?: number
  updatedAt?: number
}

export type DecoderDictionaryDeleteRequest = {
  ids: string[]
  level?: DictionaryLevel
  bookId?: string
  category?: BookType
}

export type ParsedDecoderDictionaryImport = {
  success: boolean
  entries: DictionaryEntry[]
  totalCount: number
  invalidCount: number
  error?: string
}

export type DecoderEntryDraft = {
  original: string
  real: string
  category: EntityCategory
  description: string
  aliases: string
}

export function isDecoderEntityCategory(value: unknown): value is EntityCategory {
  return (
    value === 'person' ||
    value === 'company' ||
    value === 'place' ||
    value === 'event' ||
    value === 'organization'
  )
}

export function isDecoderDictionaryLevel(value: unknown): value is DictionaryLevel {
  return value === 'global' || value === 'category' || value === 'book'
}

export function isDecoderBookType(value: unknown): value is BookType {
  return (
    value === 'era' ||
    value === 'entertainment' ||
    value === 'urban' ||
    value === 'history' ||
    value === 'business'
  )
}

function isDecoderEntrySource(value: unknown): value is EntrySource {
  return value === 'system' || value === 'user' || value === 'ai' || value === 'community'
}

export function getDecoderEntryBookType(
  entry?: Partial<DictionaryEntry> | null
): BookType | undefined {
  const tag = entry?.categoryTags?.[0]
  if (isDecoderBookType(tag)) {
    return tag
  }
  return undefined
}

export function getDecoderEntryScopeLabel(entry?: Partial<DictionaryEntry> | null): string {
  if (!entry?.level) return '公共词典'

  if (entry.level === 'book') {
    return entry.bookId ? `书籍词典 · ${entry.bookId}` : '书籍词典'
  }

  if (entry.level === 'category') {
    const bookType = getDecoderEntryBookType(entry)
    return bookType ? `分类词典 · ${bookType}` : '分类词典'
  }

  return '公共词典'
}

function normalizeDecoderDraftText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function createDecoderEntryDraft(
  entry?: Partial<DictionaryEntry> | null
): DecoderEntryDraft {
  return {
    original: normalizeDecoderDraftText(entry?.original),
    real: normalizeDecoderDraftText(entry?.real),
    category: isDecoderEntityCategory(entry?.category) ? entry.category : 'person',
    description: normalizeDecoderDraftText(entry?.description),
    aliases: entry?.aliases?.join(', ') || '',
  }
}

export function buildDecoderEntrySaveInput(
  draft: Partial<DecoderEntryDraft> | null | undefined,
  existingEntry?: Partial<DictionaryEntry> | null
): {
  entry: Partial<DictionaryEntry>
  level: DictionaryLevel
  bookId?: string
} | null {
  const original = normalizeDecoderDraftText(draft?.original)
  const real = normalizeDecoderDraftText(draft?.real)

  if (!original || !real) {
    return null
  }

  const targetLevel = existingEntry?.level || 'global'
  const targetBookId = targetLevel === 'book' ? existingEntry?.bookId : undefined
  const aliases = typeof draft?.aliases === 'string'
    ? draft.aliases.split(',').map(item => item.trim()).filter(Boolean)
    : []

  return {
    entry: {
      ...existingEntry,
      original,
      real,
      category: isDecoderEntityCategory(draft?.category) ? draft.category : 'person',
      description: normalizeDecoderDraftText(draft?.description) || undefined,
      aliases: aliases.length > 0 ? aliases : undefined,
    },
    level: targetLevel,
    bookId: targetBookId,
  }
}

export function toDecoderTransferEntry(entry: DictionaryEntry): DecoderTransferEntry {
  return {
    original: entry.original,
    real: entry.real,
    category: entry.category,
    aliases: entry.aliases?.length ? entry.aliases : undefined,
    description: entry.description || undefined,
    level: entry.level,
    bookId: entry.bookId,
    bookType: getDecoderEntryBookType(entry),
  }
}

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

export function upsertDictionaryEntries(
  existingEntries: DictionaryEntry[],
  incomingEntries: DictionaryEntry[]
): DictionaryEntry[] {
  const nextEntries = [...existingEntries]

  for (const entry of incomingEntries) {
    const index = nextEntries.findIndex(existingEntry => existingEntry.id === entry.id)
    if (index === -1) {
      nextEntries.unshift(entry)
      continue
    }

    nextEntries[index] = {
      ...nextEntries[index],
      ...entry,
    }
  }

  return nextEntries
}

export function groupDecoderEntriesByScope(
  entries: DictionaryEntry[]
): DecoderDictionaryDeleteRequest[] {
  const groupedRequests = new Map<string, DecoderDictionaryDeleteRequest>()

  for (const entry of entries) {
    const category = getDecoderEntryBookType(entry)
    const key = [entry.level, entry.bookId || '', category || ''].join('::')
    const existing = groupedRequests.get(key)

    if (existing) {
      existing.ids.push(entry.id)
      continue
    }

    groupedRequests.set(key, {
      ids: [entry.id],
      level: entry.level,
      bookId: entry.bookId,
      category,
    })
  }

  return Array.from(groupedRequests.values())
}
