import { watch } from 'vue'
import { useReaderScrollSync } from '@/composables/useReaderScrollSync'
import { setupScrollDrivenChrome } from '@/composables/reader/chrome-actions'
import { injectSpeculationRule } from '@/utils/speculation-rules'
import type { ReaderViewServices } from './view-services'
import type { ReaderViewFeatures } from './view-model-types'

export function setupReaderViewFeatureEffects(
  services: ReaderViewServices,
  features: ReaderViewFeatures
) {
  // Scroll sync: chapter index tracking + auto-load next chapter
  useReaderScrollSync({
    readerStore: services.readerStore,
    settingsStore: services.settingsStore,
  })

  // Scroll-driven toolbar: 下滑隐藏, 上滑显示
  setupScrollDrivenChrome(
    features.chrome.showToolbar,
    features.chrome.showSettings,
    features.chrome.showCatalog
  )

  // Speculation Rules: 下一章预渲染 (Chromium 121+)
  watch(
    () => ({
      catalog: services.readerStore.catalog,
      currentIndex: services.readerStore.currentChapterIndex,
    }),
    ({ catalog, currentIndex }) => {
      if (catalog && currentIndex < catalog.length - 1) {
        const nextChapter = catalog[currentIndex + 1]
        if (nextChapter?.url) {
          injectSpeculationRule(nextChapter.url)
        }
      }
    },
    { immediate: true }
  )
}
