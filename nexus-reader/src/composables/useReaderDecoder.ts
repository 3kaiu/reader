import { watch, type Ref } from 'vue'
import { useToast } from '@/components/ui/toast/use-toast'
import { useDecoder } from '@/composables/useDecoder'
import { useDecoderStore } from '@/stores/decoder'
import { useReaderStore } from '@/stores/reader'
import type { DecodedEntity } from '@/types/decoder'

function resolveCardPosition(event: MouseEvent): { x: number; y: number } {
  const target =
    event.target instanceof HTMLElement ? event.target : document.body
  const rect = target.getBoundingClientRect()
  const position = {
    x: rect.left + rect.width / 2,
    y: rect.bottom + 8,
  }

  const cardWidth = 288
  const screenWidth = window.innerWidth
  const screenHeight = window.innerHeight

  if (position.x - cardWidth / 2 < 16) {
    position.x = cardWidth / 2 + 16
  } else if (position.x + cardWidth / 2 > screenWidth - 16) {
    position.x = screenWidth - cardWidth / 2 - 16
  }

  if (position.y + 300 > screenHeight) {
    position.y = rect.top - 8
  }

  return position
}

export function useReaderDecoder(options: {
  activeBookUrl: Ref<string>
  enabled: boolean
}) {
  const { toast } = useToast()
  const readerStore = useReaderStore()
  const decoderStore = useDecoderStore()
  const decoder = useDecoder()

  async function decodeCurrentChapter() {
    if (!options.enabled) return

    const bookUrl = options.activeBookUrl.value
    if (!bookUrl || !readerStore.content) return

    decoderStore.setDecoding(true)

    try {
      const result = await decoder.decodeChapter(
        bookUrl,
        readerStore.currentChapter?.url || '',
        readerStore.content,
        {
          type: decoderStore.currentSettings.bookType || 'urban',
          tags: readerStore.currentBook?.tags,
        }
      )

      if (result) {
        decoderStore.setDecodeResult(result.entities, result.context)
      } else {
        decoderStore.setDecodeError(decoder.error.value || '解码失败')
      }
    } catch (error) {
      decoderStore.setDecodeError(
        error instanceof Error ? error.message : '解码失败'
      )
    }
  }

  async function handleToggleDecoder(enabled: boolean) {
    if (!options.enabled) return

    const bookUrl = options.activeBookUrl.value
    if (!bookUrl) return

    decoderStore.updateBookSettings(bookUrl, { enabled })

    if (enabled) {
      await decodeCurrentChapter()
    }
  }

  function handleEntityClick(entity: DecodedEntity, event: MouseEvent) {
    decoderStore.selectEntity(entity, resolveCardPosition(event))
  }

  async function handleConfirmEntity(entity: DecodedEntity) {
    const bookUrl = options.activeBookUrl.value
    if (!bookUrl) return

    const success = await decoder.confirmEntity(
      entity,
      bookUrl,
      decoderStore.currentSettings.bookType || undefined
    )

    if (success) {
      decoderStore.closeCard()
      toast({ title: '已确认' })
    }
  }

  async function handleCorrectEntity(entity: DecodedEntity, newReal: string) {
    const bookUrl = options.activeBookUrl.value
    if (!bookUrl) return

    const success = await decoder.correctEntity(
      entity,
      newReal,
      bookUrl,
      decoderStore.currentSettings.bookType || undefined
    )

    if (success) {
      decoderStore.closeCard()
      toast({ title: '已纠正' })
      await decodeCurrentChapter()
    }
  }

  watch(
    () => readerStore.currentChapterIndex,
    async () => {
      if (options.enabled && decoderStore.isEnabled) {
        await decodeCurrentChapter()
      }
    }
  )

  return {
    handleToggleDecoder,
    decodeCurrentChapter,
    handleEntityClick,
    handleConfirmEntity,
    handleCorrectEntity,
  }
}
