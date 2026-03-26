import type { DecodedEntity } from '@/types/decoder'

export interface ReaderDecoderEntityActions {
  handleEntityClick(entity: DecodedEntity, event: MouseEvent): void
  handleConfirmEntity(entity: DecodedEntity): Promise<void>
  handleCorrectEntity(entity: DecodedEntity, newReal: string): Promise<void>
}
