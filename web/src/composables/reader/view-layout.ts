import { type Ref } from 'vue'
import { useDateFormat, useFullscreen, useNow } from '@vueuse/core'

export function createReaderViewLayout(readerRef: Ref<HTMLElement | null>) {
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(readerRef)
  const formattedTime = useDateFormat(useNow(), 'HH:mm')

  return {
    readerRef,
    isFullscreen,
    toggleFullscreen,
    formattedTime,
  }
}

export type ReaderViewLayout = ReturnType<typeof createReaderViewLayout>
