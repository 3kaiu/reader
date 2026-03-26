import type { DecodedEntity } from '@/types/decoder'

export type ReaderContentEmits = {
  click: []
  loadNextChapter: []
  retryLoad: []
  entityClick: [entity: DecodedEntity, event: MouseEvent]
}
