import { computed } from 'vue'
import type { ReaderAssistLayersProps } from './reader-assist-layers-prop-types'

export function createReaderAssistBreakReminderBindings(
  props: ReaderAssistLayersProps,
) {
  const showBreakReminder = computed(
    () => props.state.eyeCare.showBreakReminder.value,
  )

  const breakReminderBindings = computed(() => ({
    readingTime: props.state.eyeCare.formatReadingTime(),
    onDismiss: () => props.state.eyeCare.dismissBreakReminder(),
  }))

  return {
    showBreakReminder,
    breakReminderBindings,
  }
}
