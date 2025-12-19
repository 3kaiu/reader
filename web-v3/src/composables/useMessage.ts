/**
 * 简单的消息提示 composable
 * 替代 Naive UI 的 useMessage
 */
export function useMessage() {
  function showToast(message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') {
    // 创建 toast 元素
    const toast = document.createElement('div')
    toast.className = `fixed top-4 left-1/2 -translate-x-1/2 z-[9999] px-4 py-2 rounded-lg shadow-lg text-sm font-medium transition-all duration-300 animate-in fade-in slide-in-from-top-2`

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
        toast.className += ' bg-foreground text-background'
    }

    toast.textContent = message
    document.body.appendChild(toast)

    // 3秒后移除
    setTimeout(() => {
      toast.style.opacity = '0'
      toast.style.transform = 'translateX(-50%) translateY(-10px)'
      setTimeout(() => toast.remove(), 300)
    }, 3000)
  }

  return {
    success: (msg: string) => showToast(msg, 'success'),
    error: (msg: string) => showToast(msg, 'error'),
    warning: (msg: string) => showToast(msg, 'warning'),
    info: (msg: string) => showToast(msg, 'info'),
  }
}
