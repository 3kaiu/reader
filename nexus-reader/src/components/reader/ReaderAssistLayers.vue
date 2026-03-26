<script setup lang="ts">
import BreakReminder from '@/components/BreakReminder.vue'
import DecoderCard from '@/components/decoder/DecoderCard.vue'
import DecoderSettingsSheet from '@/components/decoder/DecoderSettingsSheet.vue'
import DecoderStatusIndicator from '@/components/decoder/DecoderStatusIndicator.vue'
import { createReaderAssistLayersBindings } from './reader-assist-layers-bindings'
import type { ReaderAssistLayersProps } from './reader-assist-layers-prop-types'

const props = defineProps<ReaderAssistLayersProps>()
const {
  showBreakReminder,
  breakReminderBindings,
  showDecoderStatus,
  decoderStatusBindings,
  showDecoderSettings,
  decoderSettingsBindings,
  showDecoderCard,
  decoderCardBindings,
} = createReaderAssistLayersBindings(props)
</script>

<template>
  <BreakReminder
    v-if="showBreakReminder"
    v-bind="breakReminderBindings"
  />

  <DecoderStatusIndicator
    v-if="showDecoderStatus"
    v-bind="decoderStatusBindings"
  />

  <DecoderSettingsSheet
    v-if="showDecoderSettings"
    v-bind="decoderSettingsBindings"
  />

  <Teleport to="body">
    <DecoderCard
      v-if="showDecoderCard"
      v-bind="decoderCardBindings"
    />
  </Teleport>
</template>
