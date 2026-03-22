import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  getLocalStorageItem,
  setLocalStorageItem,
} from '@/utils/browserStorage'
import type {
  BookType,
  ChapterContext,
  DecodedEntity,
} from '@/types/decoder'

type DecoderBookSettings = {
  enabled: boolean
  bookType: BookType
}

type BookSettingsPatch = Partial<DecoderBookSettings>

type CardPosition = { x: number; y: number } | null

const STORAGE_KEY = 'decoder-book-settings'

function defaultBookSettings(): DecoderBookSettings {
  return {
    enabled: false,
    bookType: 'urban',
  }
}

function loadPersistedSettings(): Record<string, DecoderBookSettings> {
  try {
    const raw = getLocalStorageItem(STORAGE_KEY)
    if (!raw) {
      return {}
    }

    const parsed = JSON.parse(raw) as Record<string, Partial<DecoderBookSettings>>
    return Object.fromEntries(
      Object.entries(parsed).map(([bookId, settings]) => [
        bookId,
        {
          ...defaultBookSettings(),
          ...settings,
        },
      ])
    )
  } catch {
    return {}
  }
}

function persistSettings(settings: Record<string, DecoderBookSettings>) {
  try {
    setLocalStorageItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // ignore persistence failures
  }
}

export const useDecoderStore = defineStore('decoder', () => {
  const bookSettings = ref<Record<string, DecoderBookSettings>>(loadPersistedSettings())
  const currentBookId = ref<string | null>(null)
  const currentEntities = ref<DecodedEntity[]>([])
  const currentContext = ref<ChapterContext | null>(null)
  const isDecoding = ref(false)
  const decodeError = ref<string | null>(null)
  const selectedEntity = ref<DecodedEntity | null>(null)
  const cardPosition = ref<CardPosition>(null)

  function ensureBookSettings(bookId: string): DecoderBookSettings {
    const existing = bookSettings.value[bookId]
    if (existing) {
      return existing
    }

    const created = defaultBookSettings()
    bookSettings.value = {
      ...bookSettings.value,
      [bookId]: created,
    }
    persistSettings(bookSettings.value)
    return created
  }

  function getBookSettings(bookId: string): DecoderBookSettings {
    if (!bookId) {
      return defaultBookSettings()
    }
    return ensureBookSettings(bookId)
  }

  function updateBookSettings(bookId: string, patch: BookSettingsPatch) {
    if (!bookId) {
      return
    }

    const current = ensureBookSettings(bookId)
    const next: DecoderBookSettings = {
      ...current,
      ...patch,
    }

    bookSettings.value = {
      ...bookSettings.value,
      [bookId]: next,
    }
    persistSettings(bookSettings.value)
  }

  function setCurrentBook(bookId: string) {
    currentBookId.value = bookId
    ensureBookSettings(bookId)
    currentEntities.value = []
    currentContext.value = null
    decodeError.value = null
    selectedEntity.value = null
    cardPosition.value = null
  }

  function setDecoding(value: boolean) {
    isDecoding.value = value
    if (value) {
      decodeError.value = null
    }
  }

  function setDecodeResult(entities: DecodedEntity[], context: ChapterContext) {
    currentEntities.value = entities
    currentContext.value = context
    isDecoding.value = false
    decodeError.value = null
  }

  function setDecodeError(message: string | null) {
    decodeError.value = message
    isDecoding.value = false
  }

  function selectEntity(entity: DecodedEntity, position: { x: number; y: number }) {
    selectedEntity.value = entity
    cardPosition.value = position
  }

  function closeCard() {
    selectedEntity.value = null
    cardPosition.value = null
  }

  const currentSettings = computed(() =>
    currentBookId.value ? getBookSettings(currentBookId.value) : defaultBookSettings()
  )

  const isEnabled = computed(() => currentSettings.value.enabled)
  const validEntitiesCount = computed(
    () => currentEntities.value.filter((entity) => entity.bestMatch !== null).length
  )
  const showCard = computed(() => selectedEntity.value !== null && cardPosition.value !== null)

  return {
    currentBookId,
    currentSettings,
    currentEntities,
    currentContext,
    isEnabled,
    isDecoding,
    decodeError,
    validEntitiesCount,
    selectedEntity,
    cardPosition,
    showCard,
    getBookSettings,
    updateBookSettings,
    setCurrentBook,
    setDecoding,
    setDecodeResult,
    setDecodeError,
    selectEntity,
    closeCard,
  }
})
