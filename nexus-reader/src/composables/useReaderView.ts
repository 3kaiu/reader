import { ref } from 'vue'
import { useToast } from '@/components/ui/toast/use-toast'
import { useReaderStore } from '@/stores/reader'
import { useSettingsStore } from '@/stores/settings'
import { useOfflineStore } from '@/stores/offlineStorage'
import { useReaderDecoder } from '@/composables/useReaderDecoder'
import { useReaderChrome } from '@/composables/useReaderChrome'
import { useReaderActions } from '@/composables/useReaderActions'
import { useReaderScrollSync } from '@/composables/useReaderScrollSync'
import { useReaderSession } from '@/composables/useReaderSession'
import { useSwipeMode } from '@/composables/useSwipeMode'
import { useEyeCare } from '@/composables/useEyeCare'
import { useDecoderStore } from '@/stores/decoder'
import { isOptionalFeatureEnabled } from '@/utils/features'
import { useFullscreen, useDateFormat, useNow } from '@vueuse/core'

export function useReaderView() {
  const { toast } = useToast()
  const readerStore = useReaderStore()
  const settingsStore = useSettingsStore()
  const decoderStore = useDecoderStore()
  const eyeCare = useEyeCare()
  const offlineStore = useOfflineStore()
  const decoderAddonEnabled = isOptionalFeatureEnabled('decoder')

  const readerRef = ref<HTMLElement | null>(null)
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(readerRef)

  const { contentRef, activeBookUrl } = useReaderSession({
    toast,
    readerStore,
    settingsStore,
    offlineStore,
    decoderStore,
    decoderAddonEnabled,
  })

  const {
    showToolbar,
    showCatalog,
    showSettings,
    showSourcePicker,
    showBookInfo,
    showKeyboardHelp,
    showDecoderSettings,
    toggleToolbar,
    toggleZenMode,
    toggleCatalog,
    openCatalog,
    toggleSettings,
    openSettings,
    toggleKeyboardHelp,
    openSourcePicker,
    openBookInfo,
    openDecoderSettings,
    goBack,
    handleEscape,
  } = useReaderChrome({
    settingsStore,
    decoderStore,
    decoderAddonEnabled,
    toast,
  })

  const {
    page: swipePage,
    totalPages: swipeTotalPages,
    layout: swipeLayout,
    nextPage,
    prevPage,
  } = useSwipeMode({ readerStore, settingsStore, toggleToolbar })

  const {
    contentStyle,
    readerThemeStyle,
    isNightMode,
    toggleDayNight,
    handlePrevChapter,
    handleNextChapter,
    handleRefresh,
    handleSelectChapter,
  } = useReaderActions({
    readerStore,
    settingsStore,
    toast,
    nextPage,
    prevPage,
  })

  const {
    handleToggleDecoder,
    decodeCurrentChapter,
    handleEntityClick,
    handleConfirmEntity,
    handleCorrectEntity,
  } = useReaderDecoder({
    activeBookUrl,
    enabled: decoderAddonEnabled,
  })

  useReaderScrollSync({
    readerStore,
    settingsStore,
  })

  const formattedTime = useDateFormat(useNow(), 'HH:mm')

  return {
    readerRef,
    isFullscreen,
    toggleFullscreen,
    contentRef,
    activeBookUrl,
    readerStore,
    settingsStore,
    decoderStore,
    eyeCare,
    decoderAddonEnabled,
    showToolbar,
    showCatalog,
    showSettings,
    showSourcePicker,
    showBookInfo,
    showKeyboardHelp,
    showDecoderSettings,
    toggleToolbar,
    toggleZenMode,
    toggleCatalog,
    openCatalog,
    toggleSettings,
    openSettings,
    toggleKeyboardHelp,
    openSourcePicker,
    openBookInfo,
    openDecoderSettings,
    goBack,
    handleEscape,
    swipePage,
    swipeTotalPages,
    swipeLayout,
    contentStyle,
    readerThemeStyle,
    isNightMode,
    toggleDayNight,
    handlePrevChapter,
    handleNextChapter,
    handleRefresh,
    handleSelectChapter,
    handleToggleDecoder,
    decodeCurrentChapter,
    handleEntityClick,
    handleConfirmEntity,
    handleCorrectEntity,
    formattedTime,
  }
}
