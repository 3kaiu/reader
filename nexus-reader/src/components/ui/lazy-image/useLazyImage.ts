import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { LAZY_IMAGE_ROOT_MARGIN } from '@/constants/ui'
import type { LazyImageProps } from './types'
import { useLazyImageOptimizedSrc } from './source'

interface LazyImageEmit {
  (event: 'load'): void
  (event: 'error'): void
}

export function useLazyImage(props: LazyImageProps, emit: LazyImageEmit) {
  const containerRef = ref<HTMLElement | null>(null)
  const isInView = ref(false)
  const isLoaded = ref(false)
  const hasError = ref(false)

  const optimizedSrc = useLazyImageOptimizedSrc(props)
  const currentSrc = ref(optimizedSrc.value)

  watch(optimizedSrc, newSrc => {
    currentSrc.value = newSrc
    isLoaded.value = false
    hasError.value = false
  })

  const shouldLoad = computed(() => isInView.value && props.src)

  let observer: IntersectionObserver | null = null

  onMounted(() => {
    if (!containerRef.value) {
      return
    }

    observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            isInView.value = true
            observer?.disconnect()
          }
        })
      },
      {
        rootMargin: LAZY_IMAGE_ROOT_MARGIN,
      }
    )

    observer.observe(containerRef.value)
  })

  onUnmounted(() => {
    observer?.disconnect()
  })

  const handleLoad = () => {
    isLoaded.value = true
    emit('load')
  }

  const handleImageError = () => {
    if (currentSrc.value !== props.src) {
      currentSrc.value = props.src
      return
    }

    hasError.value = true
    emit('error')
  }

  return {
    containerRef,
    isLoaded,
    hasError,
    currentSrc,
    shouldLoad,
    handleLoad,
    handleImageError,
  }
}
