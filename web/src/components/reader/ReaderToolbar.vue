<script setup lang="ts">
/**
 * 阅读器工具栏组件
 * 包含顶部标题栏和底部功能导航栏
 */
import './reader-toolbar.css'
import ReaderToolbarPanels from './ReaderToolbarPanels.vue'

import { createReaderToolbarBindings } from './toolbar-bindings'
import type { ReaderToolbarProps } from './toolbar-prop-types'

const props = defineProps<ReaderToolbarProps>()
const { panelsProps } = createReaderToolbarBindings(props)
</script>

<template>
  <div>
    <ReaderToolbarPanels v-bind="panelsProps" />
  </div>
</template>
