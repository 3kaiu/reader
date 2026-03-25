<script setup lang="ts">
/**
 * 阅读器工具栏组件
 * 包含顶部标题栏和底部功能导航栏
 */
import './reader-toolbar.css'
import ReaderToolbarBottomBar from './ReaderToolbarBottomBar.vue'
import ReaderToolbarTopBar from './ReaderToolbarTopBar.vue'
import ReaderToolbarZenButton from './ReaderToolbarZenButton.vue'
import { createReaderToolbarBindings } from './toolbar-bindings'
import type {
  ReaderToolbarEmits,
  ReaderToolbarProps,
} from './toolbar-types'

const props = defineProps<ReaderToolbarProps>()
const emit = defineEmits<ReaderToolbarEmits>()
const {
  topBarProps,
  bottomBarProps,
  zenMode,
} = createReaderToolbarBindings(props)
</script>

<template>
  <div>
    <ReaderToolbarTopBar
      v-bind="topBarProps"
      @back="emit('back')"
      @toggle-catalog="emit('toggleCatalog')"
      @toggle-fullscreen="emit('toggleFullscreen')"
    />

    <ReaderToolbarZenButton
      :zen-mode="zenMode"
      @exit="emit('toggleZenMode')"
    />

    <ReaderToolbarBottomBar
      v-bind="bottomBarProps"
      @toggle-day-night="emit('toggleDayNight')"
      @toggle-settings="emit('toggleSettings')"
      @toggle-eye-care="emit('toggleEyeCare')"
      @toggle-zen-mode="emit('toggleZenMode')"
      @refresh="emit('refresh')"
      @prev-chapter="emit('prevChapter')"
      @next-chapter="emit('nextChapter')"
      @open-source-picker="emit('openSourcePicker')"
      @open-book-info="emit('openBookInfo')"
      @toggle-decoder="emit('toggleDecoder', $event)"
      @open-decoder-settings="emit('openDecoderSettings')"
    />
  </div>
</template>
