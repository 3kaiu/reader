import { computed } from 'vue'
import type { LazyImageProps } from './types'

let webpSupported: boolean | null = null

export function checkLazyImageWebPSupport(): boolean {
  if (webpSupported !== null) {
    return webpSupported
  }

  try {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    webpSupported = canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0
  } catch {
    webpSupported = false
  }

  return webpSupported
}

export function useLazyImageOptimizedSrc(props: LazyImageProps) {
  return computed(() => {
    if (!props.src) {
      return ''
    }

    let url = props.src

    /*
    if (checkLazyImageWebPSupport() && /\.(jpg|jpeg)$/i.test(url)) {
      url = url.replace(/\.(jpg|jpeg)$/i, '.webp')
    }
    */
    void checkLazyImageWebPSupport

    const params = new URLSearchParams()
    if (props.maxWidth) {
      params.set('width', String(props.maxWidth))
    }
    if (props.quality !== undefined) {
      params.set('quality', String(props.quality))
    }

    if (params.toString()) {
      const separator = url.includes('?') ? '&' : '?'
      url = `${url}${separator}${params.toString()}`
    }

    return url
  })
}
