import { computed } from 'vue'
import { createReaderExperienceBindings } from '@/composables/reader/experience-bindings'
import type { ReaderExperienceActions } from '@/composables/reader/experience-action-types'
import type { ReaderExperienceState } from '@/composables/reader/experience-state-types'

export interface ReaderExperienceProps {
  state: ReaderExperienceState
  actions: ReaderExperienceActions
}

export function createReaderExperienceComponentBindings(
  props: ReaderExperienceProps,
) {
  const {
    toolbarProps,
    contentProps,
    modalProps,
    assistState,
    assistActions,
    handleToggleEyeCare,
  } = createReaderExperienceBindings(props)

  const toolbarBindings = computed(() => ({
    ...toolbarProps.value,
    onBack: props.actions.goBack,
    onToggleCatalog: props.actions.openCatalog,
    onToggleFullscreen: props.actions.toggleFullscreen,
    onToggleDayNight: props.actions.toggleDayNight,
    onToggleSettings: props.actions.openSettings,
    onToggleEyeCare: handleToggleEyeCare,
    onToggleZenMode: props.actions.toggleZenMode,
    onRefresh: props.actions.handleRefresh,
    onPrevChapter: props.actions.handlePrevChapter,
    onNextChapter: props.actions.handleNextChapter,
    onOpenSourcePicker: props.actions.openSourcePicker,
    onOpenBookInfo: props.actions.openBookInfo,
    onToggleDecoder: props.actions.handleToggleDecoder,
    onOpenDecoderSettings: props.actions.openDecoderSettings,
  }))

  const contentBindings = computed(() => ({
    ...contentProps.value,
    onLoadNextChapter: props.state.readerStore.appendNextChapter,
    onRetryLoad: props.state.readerStore.retryLoadNext,
    onEntityClick: props.actions.handleEntityClick,
  }))

  const modalBindings = computed(() => ({
    ...modalProps.value,
    'onUpdate:showCatalog': props.actions.setShowCatalog,
    'onUpdate:showSettings': props.actions.setShowSettings,
    'onUpdate:showSourcePicker': props.actions.setShowSourcePicker,
    'onUpdate:showBookInfo': props.actions.setShowBookInfo,
    'onUpdate:showKeyboardHelp': props.actions.setShowKeyboardHelp,
    onSelectChapter: props.actions.handleSelectChapter,
    onRefresh: props.actions.handleRefresh,
  }))

  const assistBindings = computed(() => ({
    state: assistState.value,
    actions: assistActions,
  }))

  return {
    toolbarBindings,
    contentBindings,
    modalBindings,
    assistBindings,
    contentRef: props.actions.bindContentRef,
  }
}
