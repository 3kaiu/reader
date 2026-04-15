import { ref } from 'vue'
import { useDateFormat, useFullscreen, useNow } from '@vueuse/core'

export function createReaderViewLayout() {
  const readerRef = ref<HTMLElement | null>(null)
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
