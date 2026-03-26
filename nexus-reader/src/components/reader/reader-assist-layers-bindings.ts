import type { ReaderAssistLayersProps } from './reader-assist-layers-prop-types'
import { createReaderAssistBreakReminderBindings } from './reader-assist-break-reminder-bindings'
import { createReaderAssistDecoderCardBindings } from './reader-assist-decoder-card-bindings'
import { createReaderAssistDecoderSettingsBindings } from './reader-assist-decoder-settings-bindings'
import { createReaderAssistDecoderStatusBindings } from './reader-assist-decoder-status-bindings'

export function createReaderAssistLayersBindings(
  props: ReaderAssistLayersProps,
) {
  const { showBreakReminder, breakReminderBindings } =
    createReaderAssistBreakReminderBindings(props)
  const { showDecoderStatus, decoderStatusBindings } =
    createReaderAssistDecoderStatusBindings(props)
  const { showDecoderSettings, decoderSettingsBindings } =
    createReaderAssistDecoderSettingsBindings(props)
  const { showDecoderCard, decoderCardBindings } =
    createReaderAssistDecoderCardBindings(props)

  return {
    showBreakReminder,
    breakReminderBindings,
    showDecoderStatus,
    decoderStatusBindings,
    showDecoderSettings,
    decoderSettingsBindings,
    showDecoderCard,
    decoderCardBindings,
  }
}
