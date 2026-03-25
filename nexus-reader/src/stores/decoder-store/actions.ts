import { persistDecoderSettings, defaultBookSettings } from './persistence'
import type {
  DecoderBookSettings,
  DecoderStoreActions,
  DecoderStoreState,
} from './types'

export function createDecoderStoreActions(
  state: DecoderStoreState,
): DecoderStoreActions {
  function ensureBookSettings(bookId: string): DecoderBookSettings {
    const existing = state.bookSettings.value[bookId]
    if (existing) {
      return existing
    }

    const created = defaultBookSettings()
    state.bookSettings.value = {
      ...state.bookSettings.value,
      [bookId]: created,
    }
    persistDecoderSettings(state.bookSettings.value)
    return created
  }

  function getBookSettings(bookId: string): DecoderBookSettings {
    if (!bookId) {
      return defaultBookSettings()
    }
    return ensureBookSettings(bookId)
  }

  function updateBookSettings(bookId: string, patch: Partial<DecoderBookSettings>) {
    if (!bookId) {
      return
    }

    const current = ensureBookSettings(bookId)
    const next: DecoderBookSettings = {
      ...current,
      ...patch,
    }

    state.bookSettings.value = {
      ...state.bookSettings.value,
      [bookId]: next,
    }
    persistDecoderSettings(state.bookSettings.value)
  }

  function setCurrentBook(bookId: string) {
    state.currentBookId.value = bookId
    ensureBookSettings(bookId)
    state.currentEntities.value = []
    state.currentContext.value = null
    state.decodeError.value = null
    state.selectedEntity.value = null
    state.cardPosition.value = null
  }

  function setDecoding(value: boolean) {
    state.isDecoding.value = value
    if (value) {
      state.decodeError.value = null
    }
  }

  function setDecodeResult(
    entities: DecoderStoreState['currentEntities']['value'],
    context: NonNullable<DecoderStoreState['currentContext']['value']>,
  ) {
    state.currentEntities.value = entities
    state.currentContext.value = context
    state.isDecoding.value = false
    state.decodeError.value = null
  }

  function setDecodeError(message: string | null) {
    state.decodeError.value = message
    state.isDecoding.value = false
  }

  function selectEntity(entity: DecoderStoreState['selectedEntity']['value'], position: { x: number; y: number }) {
    state.selectedEntity.value = entity
    state.cardPosition.value = position
  }

  function closeCard() {
    state.selectedEntity.value = null
    state.cardPosition.value = null
  }

  return {
    getBookSettings,
    updateBookSettings,
    setCurrentBook,
    setDecoding,
    setDecodeResult,
    setDecodeError,
    selectEntity,
    closeCard,
  }
}
