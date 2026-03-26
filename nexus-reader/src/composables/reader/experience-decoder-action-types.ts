import type { DecodedEntity } from '@/types/decoder'

export interface ReaderExperienceDecoderActions {
  handleToggleDecoder(enabled: boolean): void | Promise<void>
  decodeCurrentChapter(): void | Promise<void>
  handleEntityClick(entity: DecodedEntity, event: MouseEvent): void
  handleConfirmEntity(entity: DecodedEntity): void | Promise<void>
  handleCorrectEntity(
    entity: DecodedEntity,
    newReal: string,
  ): void | Promise<void>
}
