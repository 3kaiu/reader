import type { useEyeCare } from '@/composables/useEyeCare'
import type { useDecoderStore } from '@/stores/decoder'
import type { DecodedEntity } from '@/types/decoder'

export interface ReaderAssistState {
  eyeCare: ReturnType<typeof useEyeCare>
  decoderStore: ReturnType<typeof useDecoderStore>
  decoderAddonEnabled: boolean
  activeBookUrl: string
  showDecoderSettings: boolean
}

export interface ReaderAssistActions {
  setShowDecoderSettings(value: boolean): void
  decodeCurrentChapter(): void | Promise<void>
  handleConfirmEntity(entity: DecodedEntity): void | Promise<void>
  handleCorrectEntity(
    entity: DecodedEntity,
    newReal: string,
  ): void | Promise<void>
}
