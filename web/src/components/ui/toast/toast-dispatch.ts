import { TOAST_LIMIT } from './toast-config'
import { toastState } from './toast-state'
import type { ToastAction } from './toast-types'

export function dispatchToast(action: ToastAction) {
  switch (action.type) {
    case 'ADD_TOAST':
      toastState.value.toasts = [action.toast, ...toastState.value.toasts].slice(0, TOAST_LIMIT)
      break

    case 'UPDATE_TOAST':
      toastState.value.toasts = toastState.value.toasts.map(t =>
        t.id === action.toast.id ? { ...t, ...action.toast } : t
      )
      break

    case 'DISMISS_TOAST':
      toastState.value.toasts = toastState.value.toasts.map(t =>
        t.id === action.toastId || action.toastId === undefined
          ? {
              ...t,
              open: false,
            }
          : t
      )
      break

    case 'REMOVE_TOAST':
      if (action.toastId === undefined) {
        toastState.value.toasts = []
      } else {
        toastState.value.toasts = toastState.value.toasts.filter(t => t.id !== action.toastId)
      }
      break
  }
}
