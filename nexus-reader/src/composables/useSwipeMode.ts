/**
 * Swipe Mode Composables
 *
 * Provides swipe-based navigation modes for reading interfaces,
 * supporting different swipe behaviors and customization.
 */

import { ref, computed, readonly, watch, nextTick } from 'vue'
import { logger } from '@/utils/logger'

export type SwipeMode = 'page' | 'scroll' | 'chapter' | 'disabled'

export interface SwipeConfig {
  mode: SwipeMode
  sensitivity: number // 0-1
  velocityThreshold: number
  enableHapticFeedback: boolean
  enableAnimation: boolean
  animationDuration: number
}

export interface SwipeState {
  isActive: boolean
  direction: 'left' | 'right' | 'up' | 'down' | null
  progress: number // 0-1
  velocity: number
  distance: number
}

export interface SwipeHandlers {
  onSwipeStart?: (direction: string) => void
  onSwipeProgress?: (progress: number, direction: string) => void
  onSwipeComplete?: (direction: string, success: boolean) => void
  onSwipeCancel?: (direction: string) => void
}

export function useSwipeMode(
  config: Partial<SwipeConfig> = {},
  handlers: SwipeHandlers = {}
) {
  const defaultConfig: SwipeConfig = {
    mode: 'page',
    sensitivity: 0.5,
    velocityThreshold: 0.5,
    enableHapticFeedback: true,
    enableAnimation: true,
    animationDuration: 300
  }

  const currentConfig = ref<SwipeConfig>({ ...defaultConfig, ...config })
  const swipeState = ref<SwipeState>({
    isActive: false,
    direction: null,
    progress: 0,
    velocity: 0,
    distance: 0
  })

  const isSwipeEnabled = computed(() => currentConfig.value.mode !== 'disabled')
  const swipeThreshold = computed(() => 100 * currentConfig.value.sensitivity)

  /**
   * Update swipe configuration
   */
  const updateConfig = (newConfig: Partial<SwipeConfig>) => {
    currentConfig.value = { ...currentConfig.value, ...newConfig }
    logger.debug('Swipe mode config updated', { config: currentConfig.value })
  }

  /**
   * Start a swipe gesture
   */
  const startSwipe = (startX: number, startY: number, direction: SwipeState['direction']) => {
    if (!isSwipeEnabled.value) return false

    swipeState.value = {
      isActive: true,
      direction,
      progress: 0,
      velocity: 0,
      distance: 0
    }

    handlers.onSwipeStart?.(direction || '')
    logger.debug('Swipe started', { direction, startX, startY })
    return true
  }

  /**
   * Update swipe progress
   */
  const updateSwipe = (currentX: number, currentY: number, startX: number, startY: number) => {
    if (!swipeState.value.isActive) return

    const deltaX = currentX - startX
    const deltaY = currentY - startY
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)

    swipeState.value.distance = distance
    swipeState.value.progress = Math.min(distance / swipeThreshold.value, 1)

    handlers.onSwipeProgress?.(swipeState.value.progress, swipeState.value.direction || '')
  }

  /**
   * Complete a swipe gesture
   */
  const completeSwipe = (velocity: number = 0) => {
    if (!swipeState.value.isActive) return

    swipeState.value.velocity = velocity
    const success = swipeState.value.progress >= 1 ||
                   (velocity > currentConfig.value.velocityThreshold)

    if (success) {
      // Trigger haptic feedback if enabled
      if (currentConfig.value.enableHapticFeedback && 'vibrate' in navigator) {
        navigator.vibrate(50)
      }

      handlers.onSwipeComplete?.(swipeState.value.direction || '', true)
      performSwipeAction(swipeState.value.direction || '')
    } else {
      handlers.onSwipeCancel?.(swipeState.value.direction || '')
    }

    logger.debug('Swipe completed', {
      direction: swipeState.value.direction,
      success,
      progress: swipeState.value.progress,
      velocity
    })

    // Reset state
    swipeState.value.isActive = false
    swipeState.value.progress = 0
    swipeState.value.distance = 0
  }

  /**
   * Cancel swipe gesture
   */
  const cancelSwipe = () => {
    if (!swipeState.value.isActive) return

    handlers.onSwipeCancel?.(swipeState.value.direction || '')
    logger.debug('Swipe cancelled', { direction: swipeState.value.direction })

    swipeState.value.isActive = false
    swipeState.value.progress = 0
    swipeState.value.distance = 0
  }

  /**
   * Perform the actual swipe action based on mode
   */
  const performSwipeAction = async (direction: string) => {
    switch (currentConfig.value.mode) {
      case 'page':
        await performPageNavigation(direction)
        break
      case 'scroll':
        await performScrollAction(direction)
        break
      case 'chapter':
        await performChapterNavigation(direction)
        break
      default:
        logger.warn('Unknown swipe mode', { mode: currentConfig.value.mode })
    }
  }

  /**
   * Page navigation mode
   */
  const performPageNavigation = async (direction: string) => {
    // Emit navigation events
    const event = new CustomEvent('swipe-navigation', {
      detail: { direction, mode: 'page' }
    })
    window.dispatchEvent(event)

    logger.info('Page navigation swipe', { direction })
  }

  /**
   * Scroll mode
   */
  const performScrollAction = async (direction: string) => {
    const scrollAmount = window.innerHeight * 0.8

    if (direction === 'up') {
      window.scrollBy({ top: -scrollAmount, behavior: 'smooth' })
    } else if (direction === 'down') {
      window.scrollBy({ top: scrollAmount, behavior: 'smooth' })
    }

    logger.debug('Scroll swipe action', { direction, amount: scrollAmount })
  }

  /**
   * Chapter navigation mode
   */
  const performChapterNavigation = async (direction: string) => {
    // Emit chapter navigation events
    const event = new CustomEvent('chapter-navigation', {
      detail: { direction, mode: 'chapter' }
    })
    window.dispatchEvent(event)

    logger.info('Chapter navigation swipe', { direction })
  }

  /**
   * Get swipe progress for UI feedback
   */
  const getProgressIndicator = () => {
    if (!swipeState.value.isActive) return null

    return {
      direction: swipeState.value.direction,
      progress: swipeState.value.progress,
      threshold: swipeThreshold.value,
      willComplete: swipeState.value.progress >= 1
    }
  }

  /**
   * Enable/disable swipe mode
   */
  const setEnabled = (enabled: boolean) => {
    if (!enabled) {
      currentConfig.value.mode = 'disabled'
    } else if (currentConfig.value.mode === 'disabled') {
      currentConfig.value.mode = 'page'
    }
    logger.debug('Swipe mode toggled', { enabled: currentConfig.value.mode !== 'disabled' })
  }

  // Watch config changes
  watch(
    () => currentConfig.value,
    (newConfig) => {
      logger.debug('Swipe config changed', { config: newConfig })
    },
    { deep: true }
  )

  return {
    // State
    config: currentConfig,
    swipeState: readonly(swipeState),
    isSwipeEnabled,
    swipeThreshold,

    // Methods
    updateConfig,
    startSwipe,
    updateSwipe,
    completeSwipe,
    cancelSwipe,
    getProgressIndicator,
    setEnabled,

    // Actions
    performPageNavigation,
    performScrollAction,
    performChapterNavigation
  }
}

// Export types
export type { SwipeMode, SwipeConfig, SwipeState, SwipeHandlers }