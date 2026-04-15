<script setup lang="ts">
import ReaderExperienceLayout from './ReaderExperienceLayout.vue'
import { createReaderExperienceComponentBindings } from './reader-experience-bindings'
import type { ReaderExperienceBindingProps } from '@/composables/reader/experience-binding-prop-types'

const props = defineProps<ReaderExperienceBindingProps>()

const { layoutProps } = createReaderExperienceComponentBindings(props)
</script>

<template>
  <ReaderExperienceLayout v-bind="layoutProps" />
</template>
