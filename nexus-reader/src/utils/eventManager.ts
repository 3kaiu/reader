/**
 * 统一事件管理器
 * 防止事件监听器泄漏，提供自动清理机制
 */

interface EventListenerInfo {
  target: EventTarget
  event: string
  handler: EventListener
  options?: AddEventListenerOptions
  cleanup: () => void
}

class EventManager {
  private listeners = new Map<string, EventListenerInfo>()
  private static instance: EventManager | null = null
  
  // 单例模式
  static getInstance(): EventManager {
    if (!EventManager.instance) {
      EventManager.instance = new EventManager()
    }
    return EventManager.instance
  }
  
  /**
   * 添加事件监听器
   * @param target 事件目标
   * @param event 事件类型
   * @param handler 事件处理器
   * @param options 事件选项
   * @returns 监听器ID，用于后续移除
   */
  addEventListener(
    target: EventTarget, 
    event: string, 
    handler: EventListener, 
    options?: AddEventListenerOptions
  ): string {
    const id = `${target.constructor.name}-${event}-${Date.now()}-${Math.random()}`
    
    const cleanup = () => {
      target.removeEventListener(event, handler, options)
    }
    
    target.addEventListener(event, handler, options)
    
    this.listeners.set(id, {
      target,
      event,
      handler,
      options,
      cleanup
    })
    
    return id
  }
  
  /**
   * 移除指定的事件监听器
   * @param id 监听器ID
   */
  removeEventListener(id: string): boolean {
    const listener = this.listeners.get(id)
    if (listener) {
      listener.cleanup()
      this.listeners.delete(id)
      return true
    }
    return false
  }
  
  /**
   * 移除指定目标的所有事件监听器
   * @param target 事件目标
   */
  removeAllListenersForTarget(target: EventTarget): number {
    let removed = 0
    const toRemove: string[] = []
    
    for (const [id, listener] of this.listeners.entries()) {
      if (listener.target === target) {
        listener.cleanup()
        toRemove.push(id)
        removed++
      }
    }
    
    toRemove.forEach(id => this.listeners.delete(id))
    return removed
  }
  
  /**
   * 清理所有事件监听器
   */
  cleanup(): number {
    const count = this.listeners.size
    
    this.listeners.forEach(listener => {
      listener.cleanup()
    })
    
    this.listeners.clear()
    return count
  }
  
  /**
   * 获取当前监听器数量
   */
  getListenerCount(): number {
    return this.listeners.size
  }
  
  /**
   * 获取监听器统计信息
   */
  getStats(): { total: number; byEvent: Record<string, number>; byTarget: Record<string, number> } {
    const byEvent: Record<string, number> = {}
    const byTarget: Record<string, number> = {}
    
    this.listeners.forEach(listener => {
      byEvent[listener.event] = (byEvent[listener.event] || 0) + 1
      const targetName = listener.target.constructor.name
      byTarget[targetName] = (byTarget[targetName] || 0) + 1
    })
    
    return {
      total: this.listeners.size,
      byEvent,
      byTarget
    }
  }
}

// 导出单例实例
export const eventManager = EventManager.getInstance()

// 便捷的组合式函数
export function useEventManager() {
  const listeners = new Set<string>()
  
  const addEventListener = (
    target: EventTarget,
    event: string,
    handler: EventListener,
    options?: AddEventListenerOptions
  ) => {
    const id = eventManager.addEventListener(target, event, handler, options)
    listeners.add(id)
    return id
  }
  
  const removeEventListener = (id: string) => {
    if (eventManager.removeEventListener(id)) {
      listeners.delete(id)
      return true
    }
    return false
  }
  
  const cleanup = () => {
    let removed = 0
    listeners.forEach(id => {
      if (eventManager.removeEventListener(id)) {
        removed++
      }
    })
    listeners.clear()
    return removed
  }
  
  return {
    addEventListener,
    removeEventListener,
    cleanup,
    getListenerCount: () => listeners.size
  }
}

// 开发环境下的调试工具
if (import.meta.env.DEV) {
  // 每30秒检查一次监听器数量
  setInterval(() => {
    const stats = eventManager.getStats()
    if (stats.total > 100) {
      console.warn('[EventManager] 检测到大量事件监听器:', stats)
    }
  }, 30000)
  
  // 暴露到全局对象供调试
  ;(window as any).__eventManager = eventManager
}