import { TOAST_REMOVE_DELAY } from './toast-config'
import { dispatchToast } from './toast-dispatch'
import { toastState } from './toast-state'

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

export function addToastToRemoveQueue(toastId: string) {
  if (toastTimeouts.has(toastId)) {
    return
  }

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId)
    dispatchToast({
      type: 'REMOVE_TOAST',
      toastId,
    })
  }, TOAST_REMOVE_DELAY)

  toastTimeouts.set(toastId, timeout)
}

export function dismissToastById(toastId?: string) {
  if (toastId) {
    addToastToRemoveQueue(toastId)
  } else {
    toastState.value.toasts.forEach(toast => {
      addToastToRemoveQueue(toast.id)
    })
  }

  dispatchToast({
    type: 'DISMISS_TOAST',
    toastId,
  })
}
