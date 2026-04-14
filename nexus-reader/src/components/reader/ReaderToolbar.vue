<script setup lang="ts">
/**
 * 阅读器工具栏组件
 * 包含顶部标题栏和底部功能导航栏
 */
import './reader-toolbar.css'
import ReaderToolbarPanels from './ReaderToolbarPanels.vue'

import { createReaderToolbarBindings } from './toolbar-bindings'
import type { ReaderToolbarEmits } from './toolbar-emit-types'
import type { ReaderToolbarProps } from './toolbar-prop-types'

const props = defineProps<ReaderToolbarProps>()
const emit = defineEmits<ReaderToolbarEmits>()
const { panelsProps } = createReaderToolbarBindings(props)
</script>

<template>
  <div>
    <ReaderToolbarPanels
      v-bind="panelsProps"
      @back="emit('back')"
      @toggle-catalog="emit('toggleCatalog')"
      @toggle-fullscreen="emit('toggleFullscreen')"
      @toggle-day-night="emit('toggleDayNight')"
      @toggle-settings="emit('toggleSettings')"
      @toggle-eye-care="emit('toggleEyeCare')"
      @toggle-zen-mode="emit('toggleZenMode')"
      @refresh="emit('refresh')"
      @prev-chapter="emit('prevChapter')"
      @next-chapter="emit('nextChapter')"
      @open-source-picker="emit('openSourcePicker')"
      @open-book-info="emit('openBookInfo')"
    />
  </div>
</template>
