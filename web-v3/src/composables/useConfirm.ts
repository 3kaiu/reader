/**
 * 确认对话框 composable
 * 替代原生的 confirm() 函数
 * 使用全局单例模式，所有组件共享同一个确认对话框状态
 */
import { ref } from 'vue'

export interface ConfirmOptions {
  title?: string
  description?: string
  confirmText?: string
  cancelText?: string
  variant?: 'default' | 'destructive'
}

// 全局状态（单例）
const isOpen = ref(false)
const options = ref<ConfirmOptions>({})
let resolveCallback: ((value: boolean) => void) | null = null

export function useConfirm() {
  function confirm(opts: ConfirmOptions | string): Promise<boolean> {
    return new Promise((resolve) => {
      if (typeof opts === 'string') {
        options.value = {
          title: '确认',
          description: opts,
          confirmText: '确定',
          cancelText: '取消',
        }
      } else {
        options.value = {
          title: '确认',
          confirmText: '确定',
          cancelText: '取消',
          variant: 'default',
          ...opts,
        }
      }

      resolveCallback = resolve
      isOpen.value = true
    })
  }

  function handleConfirm() {
    if (resolveCallback) {
      resolveCallback(true)
      resolveCallback = null
    }
    isOpen.value = false
  }

  function handleCancel() {
    if (resolveCallback) {
      resolveCallback(false)
      resolveCallback = null
    }
    isOpen.value = false
  }

  return {
    isOpen,
    options,
    confirm,
    handleConfirm,
    handleCancel,
  }
}
