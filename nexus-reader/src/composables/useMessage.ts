/**
 * 消息提示 composable
 * 替代 Naive UI 的 useMessage
 * 提供统一的 Toast 提示功能
 */

export interface ToastOptions {
  duration?: number // 显示时长（毫秒），默认 3000
  position?: 'top' | 'center' | 'bottom' // 位置，默认 top
}

const activeToasts: Set<HTMLDivElement> = new Set()

export function useMessage() {
  function showToast(
    message: string,
    type: 'success' | 'error' | 'warning' | 'info' = 'info',
    options: ToastOptions = {}
  ) {
    // 限制同时显示的 toast 数量
    if (activeToasts.size >= 5) {
      const firstToast = Array.from(activeToasts)[0]
      firstToast?.remove()
    }

    const { duration = 3000, position = 'top' } = options

    // 创建 toast 容器
    const toast = document.createElement('div')
    toast.className = `fixed left-1/2 -translate-x-1/2 z-[9999] px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium transition-all duration-300 animate-in fade-in slide-in-from-top-2 max-w-[90vw] sm:max-w-md`

    // 根据位置设置 top 或 bottom
    if (position === 'top') {
      toast.style.top = `${20 + activeToasts.size * 60}px`
    } else if (position === 'bottom') {
      toast.style.bottom = `${20 + activeToasts.size * 60}px`
    } else {
      toast.style.top = '50%'
      toast.style.transform = 'translate(-50%, -50%)'
    }

    // 根据类型设置样式
    switch (type) {
      case 'success':
        toast.className += ' bg-green-500 text-white'
        break
      case 'error':
        toast.className += ' bg-red-500 text-white'
        break
      case 'warning':
        toast.className += ' bg-yellow-500 text-white'
        break
      default:
        toast.className += ' bg-foreground text-background border border-border'
    }

    toast.textContent = message
    document.body.appendChild(toast)
    activeToasts.add(toast)

    // 自动移除
    const timeoutId = setTimeout(() => {
      removeToast(toast)
    }, duration)

    // 点击关闭
    toast.addEventListener('click', () => {
      clearTimeout(timeoutId)
      removeToast(toast)
    })

    // 错误类型的 toast 显示时间更长
    if (type === 'error' && duration === 3000) {
      clearTimeout(timeoutId)
      setTimeout(() => {
        removeToast(toast)
      }, 5000)
    }
  }

  function removeToast(toast: HTMLDivElement) {
    toast.style.opacity = '0'
    toast.style.transform = toast.style.top?.includes('50%')
      ? 'translate(-50%, -60%)'
      : 'translateX(-50%) translateY(-10px)'
    
    setTimeout(() => {
      toast.remove()
      activeToasts.delete(toast)
      // 重新排列剩余 toast 的位置
      repositionToasts()
    }, 300)
  }

  function repositionToasts() {
    const toasts = Array.from(activeToasts)
    toasts.forEach((toast, index) => {
      const position = toast.style.top?.includes('50%') ? 'center' : 
                       toast.style.top ? 'top' : 'bottom'
      
      if (position === 'top') {
        toast.style.top = `${20 + index * 60}px`
      } else if (position === 'bottom') {
        toast.style.bottom = `${20 + index * 60}px`
      }
    })
  }

  return {
    success: (msg: string, options?: ToastOptions) => showToast(msg, 'success', options),
    error: (msg: string, options?: ToastOptions) => showToast(msg, 'error', options),
    warning: (msg: string, options?: ToastOptions) => showToast(msg, 'warning', options),
    info: (msg: string, options?: ToastOptions) => showToast(msg, 'info', options),
  }
}
