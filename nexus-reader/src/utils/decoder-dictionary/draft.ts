import type {
  DictionaryEntry,
  DictionaryLevel,
} from '@/types/decoder'
import { isDecoderEntityCategory } from './guards'
import type { DecoderEntryDraft } from './types'

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
