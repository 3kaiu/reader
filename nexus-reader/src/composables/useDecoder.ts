import { ref } from 'vue'
import { createDecoderActions } from '@/composables/decoder/actions'

export function useDecoder() {
  const error = ref<string | null>(null)
  const actions = createDecoderActions(error)

  return {
    error,
    ...actions,
  }
}
