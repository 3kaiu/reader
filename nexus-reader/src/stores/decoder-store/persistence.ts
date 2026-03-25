import {
  getLocalStorageItem,
  setLocalStorageItem,
} from '@/utils/browserStorage'
import type { DecoderBookSettings } from './types'

const STORAGE_KEY = 'decoder-book-settings'

export function defaultBookSettings(): DecoderBookSettings {
  return {
    enabled: false,
    bookType: 'urban',
  }
}

export function loadPersistedDecoderSettings(): Record<string, DecoderBookSettings> {
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
      ]),
    )
  } catch {
    return {}
  }
}

export function persistDecoderSettings(
  settings: Record<string, DecoderBookSettings>,
) {
  try {
    setLocalStorageItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // ignore persistence failures
  }
}
