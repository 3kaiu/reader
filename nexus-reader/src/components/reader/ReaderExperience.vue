<script setup lang="ts">
import ReaderExperienceLayout from './ReaderExperienceLayout.vue'
import { createReaderExperienceComponentBindings } from './reader-experience-bindings'
import type { ReaderExperienceProps } from './reader-experience-prop-types'

const props = defineProps<ReaderExperienceProps>()

const { layoutProps } = createReaderExperienceComponentBindings(props)
</script>

<template>
  <ReaderExperienceLayout v-bind="layoutProps" />
</template>
