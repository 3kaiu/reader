import type { ComputedRef, Ref } from 'vue'
import type {
  BookType,
  ChapterContext,
  DecodedEntity,
} from '@/types/decoder'

export type DecoderBookSettings = {
  enabled: boolean
  bookType: BookType
}

export type BookSettingsPatch = Partial<DecoderBookSettings>

export type CardPosition = { x: number; y: number } | null

export interface DecoderStoreState {
  bookSettings: Ref<Record<string, DecoderBookSettings>>
  currentBookId: Ref<string | null>
  currentEntities: Ref<DecodedEntity[]>
  currentContext: Ref<ChapterContext | null>
  isDecoding: Ref<boolean>
  decodeError: Ref<string | null>
  selectedEntity: Ref<DecodedEntity | null>
  cardPosition: Ref<CardPosition>
}

export interface DecoderStoreView {
  currentSettings: ComputedRef<DecoderBookSettings>
  isEnabled: ComputedRef<boolean>
  validEntitiesCount: ComputedRef<number>
  showCard: ComputedRef<boolean>
}

export interface DecoderStoreActions {
  getBookSettings(bookId: string): DecoderBookSettings
  updateBookSettings(bookId: string, patch: BookSettingsPatch): void
  setCurrentBook(bookId: string): void
  setDecoding(value: boolean): void
  setDecodeResult(entities: DecodedEntity[], context: ChapterContext): void
  setDecodeError(message: string | null): void
  selectEntity(entity: DecodedEntity, position: { x: number; y: number }): void
  closeCard(): void
}
