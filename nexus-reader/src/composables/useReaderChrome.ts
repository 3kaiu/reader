import { onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useDecoderStore } from '@/stores/decoder'
import { useSettingsStore } from '@/stores/settings'

type ReaderToast = (payload: {
  title: string
  description?: string
  variant?: 'default' | 'destructive'
  duration?: number
}) => unknown

export function useReaderChrome(options: {
  settingsStore: ReturnType<typeof useSettingsStore>
  decoderStore: ReturnType<typeof useDecoderStore>
  decoderAddonEnabled: boolean
  toast: ReaderToast
}) {
  const router = useRouter()
  const showToolbar = ref(false)
  const showCatalog = ref(false)
  const showSettings = ref(false)
  const showSourcePicker = ref(false)
  const showBookInfo = ref(false)
  const showKeyboardHelp = ref(false)
  const showDecoderSettings = ref(false)
  const hideToolbarTimer = ref<ReturnType<typeof setTimeout> | null>(null)

  function clearHideTimer() {
    if (hideToolbarTimer.value) {
      clearTimeout(hideToolbarTimer.value)
      hideToolbarTimer.value = null
    }
  }

  function startHideTimer() {
    clearHideTimer()
    hideToolbarTimer.value = setTimeout(() => {
      if (!showSettings.value && !showCatalog.value) {
        showToolbar.value = false
      }
    }, 4000)
  }

  function toggleToolbar() {
    if (options.settingsStore.config.zenMode) return

    showToolbar.value = !showToolbar.value
    if (showToolbar.value) {
      startHideTimer()
    }
  }

  function toggleZenMode() {
    const nextState = !options.settingsStore.config.zenMode
    options.settingsStore.updateConfig('zenMode', nextState)

    if (nextState) {
      showToolbar.value = false
      showSettings.value = false
      showCatalog.value = false
      options.toast({
        title: '已进入禅模式',
        description: '所有界面已隐藏，双击中央区域退出',
        duration: 3000,
      })
      return
    }

    options.toast({ title: '已退出禅模式', duration: 2000 })
  }

  function toggleCatalog() {
    showCatalog.value = !showCatalog.value
  }

  function openCatalog() {
    showCatalog.value = true
  }

  function toggleSettings() {
    showSettings.value = !showSettings.value
  }

  function openSettings() {
    showSettings.value = true
  }

  function toggleKeyboardHelp() {
    showKeyboardHelp.value = !showKeyboardHelp.value
  }

  function openSourcePicker() {
    showSourcePicker.value = true
  }

  function openBookInfo() {
    showBookInfo.value = true
  }

  function openDecoderSettings() {
    showDecoderSettings.value = true
  }

  function goBack() {
    void router.push('/')
  }

  function handleEscape() {
    if (options.decoderAddonEnabled && options.decoderStore.showCard) {
      options.decoderStore.closeCard()
      return
    }
    if (showDecoderSettings.value) {
      showDecoderSettings.value = false
      return
    }
    if (showKeyboardHelp.value) {
      showKeyboardHelp.value = false
      return
    }
    if (showBookInfo.value) {
      showBookInfo.value = false
      return
    }
    if (showSourcePicker.value) {
      showSourcePicker.value = false
      return
    }
    if (showSettings.value) {
      showSettings.value = false
      return
    }
    if (showCatalog.value) {
      showCatalog.value = false
      return
    }
    if (showToolbar.value) {
      showToolbar.value = false
      return
    }

    goBack()
  }

  onUnmounted(() => {
    clearHideTimer()
  })

  return {
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
  }
}
