/**
 * 确认对话框组合函数
 */
import { ref, readonly } from 'vue'

interface ConfirmOptions {
  title?: string
  message?: string
  description?: string
  confirmText?: string
  cancelText?: string
  type?: 'info' | 'warning' | 'danger'
  variant?: 'default' | 'destructive'
}

type ResolvedConfirmOptions = ConfirmOptions & {
  message: string
}

export function useConfirm() {
  const confirmDialog = ref<{
    visible: boolean
    options: ResolvedConfirmOptions | null
    resolve: ((value: boolean) => void) | null
  }>({
    visible: false,
    options: null,
    resolve: null,
  })

  const showConfirm = (options: ResolvedConfirmOptions): Promise<boolean> => {
    return new Promise(resolve => {
      confirmDialog.value = {
        visible: true,
        options,
        resolve,
      }
    })
  }

  const handleConfirm = (confirmed: boolean) => {
    if (confirmDialog.value.resolve) {
      confirmDialog.value.resolve(confirmed)
    }

    confirmDialog.value = {
      visible: false,
      options: null,
      resolve: null,
    }
  }

  const hideConfirm = () => {
    handleConfirm(false)
  }

  return {
    confirmDialog: readonly(confirmDialog),
    confirm: (options: ConfirmOptions) =>
      showConfirm({
        ...options,
        message: options.message || options.description || '',
        type: options.type || (options.variant === 'destructive' ? 'danger' : 'info'),
      }),
    showConfirm,
    handleConfirm,
    hideConfirm,
  }
}
