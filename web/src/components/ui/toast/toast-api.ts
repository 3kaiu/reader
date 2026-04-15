import { computed } from 'vue'
import { dispatchToast } from './toast-dispatch'
import { genToastId } from './toast-id'
import { dismissToastById } from './toast-queue'
import { toastState } from './toast-state'
import type { ToasterToast } from './toast-types'

export function toast(props: Omit<ToasterToast, 'id'>) {
  const id = genToastId()

  const update = (nextProps: ToasterToast) =>
    dispatchToast({
      type: 'UPDATE_TOAST',
      toast: { ...nextProps, id },
    })

  const dismiss = () => dismissToastById(id)

  dispatchToast({
    type: 'ADD_TOAST',
    toast: {
      ...props,
      id,
      open: true,
      onOpenChange: open => {
        if (!open) {
          dismiss()
        }
      },
    },
  })

  return {
    id,
    dismiss,
    update,
  }
}

export function useToast() {
  return {
    toasts: computed(() => toastState.value.toasts),
    toast,
    dismiss: (toastId?: string) => dismissToastById(toastId),
  }
}
