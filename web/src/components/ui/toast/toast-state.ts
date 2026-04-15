import { ref } from 'vue'
import type { ToastState } from './toast-types'

export const toastState = ref<ToastState>({
  toasts: [],
})
