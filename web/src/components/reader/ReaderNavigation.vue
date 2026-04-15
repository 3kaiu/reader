<script setup lang="ts">
/**
 * 阅读器章节导航组件
 * 包含上一章/下一章切换按钮和进度文字
 */
import ReaderNavigationContent from './ReaderNavigationContent.vue'
import { createReaderNavigationViewBindings } from './reader-navigation-view-bindings'
import type { ReaderNavigationEmits, ReaderNavigationProps } from './reader-navigation-types'

const props = defineProps<ReaderNavigationProps>()
const emit = defineEmits<ReaderNavigationEmits>()
const { contentBindings } = createReaderNavigationViewBindings(props, emit)
</script>

<template>
  <ReaderNavigationContent v-bind="contentBindings" />
</template>
