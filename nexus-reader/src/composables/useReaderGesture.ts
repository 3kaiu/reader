/**
 * Reader Gesture Composables
 *
 * Provides gesture recognition and handling for reading interfaces,
 * supporting swipe navigation, pinch-to-zoom, and other touch interactions.
 */

import { ref, reactive, readonly, onMounted, onUnmounted } from 'vue'
import { logger } from '@/utils/logger'

export interface GestureState {
  isActive: boolean
  startX: number
  startY: number
  currentX: number
  currentY: number
  deltaX: number
  deltaY: number
  velocity: number
  direction: 'left' | 'right' | 'up' | 'down' | null
  distance: number
}

export interface GestureConfig {
  minSwipeDistance: number
  maxSwipeTime: number
  velocityThreshold: number
  enablePinch: boolean
  enablePan: boolean
}

export interface GestureHandlers {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  onSwipeUp?: () => void
  onSwipeDown?: () => void
  onPinchStart?: (scale: number) => void
  onPinchMove?: (scale: number, delta: number) => void
  onPinchEnd?: (scale: number) => void
  onPanStart?: (x: number, y: number) => void
  onPanMove?: (x: number, y: number, deltaX: number, deltaY: number) => void
  onPanEnd?: (x: number, y: number) => void
  onTap?: (x: number, y: number) => void
  onDoubleTap?: (x: number, y: number) => void
}

export function useReaderGesture(
  element: HTMLElement | null,
  handlers: GestureHandlers = {},
  config: Partial<GestureConfig> = {}
) {
  const defaultConfig: GestureConfig = {
    minSwipeDistance: 50,
    maxSwipeTime: 300,
    velocityThreshold: 0.3,
    enablePinch: true,
    enablePan: true,
  }

  const mergedConfig = { ...defaultConfig, ...config }
  const gestureState = reactive<GestureState>({
    isActive: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    deltaX: 0,
    deltaY: 0,
    velocity: 0,
    direction: null,
    distance: 0,
  })

  const isPinching = ref(false)
  const initialPinchDistance = ref(0)
  const currentPinchScale = ref(1)
  const lastTapTime = ref(0)
  const touchStartTime = ref(0)

  const calculateDirection = (deltaX: number, deltaY: number): GestureState['direction'] => {
    const absX = Math.abs(deltaX)
    const absY = Math.abs(deltaY)

    if (absX > absY) {
      return deltaX > 0 ? 'right' : 'left'
    } else {
      return deltaY > 0 ? 'down' : 'up'
    }
  }

  const calculateVelocity = (distance: number, time: number): number => {
    return time > 0 ? distance / time : 0
  }

  const handleTouchStart = (event: TouchEvent) => {
    if (!element) return

    touchStartTime.value = Date.now()

    if (event.touches.length === 1) {
      // Single touch - potential swipe or tap
      const touch = event.touches[0]
      gestureState.startX = touch.clientX
      gestureState.startY = touch.clientY
      gestureState.currentX = touch.clientX
      gestureState.currentY = touch.clientY
      gestureState.isActive = true
      gestureState.direction = null

      if (mergedConfig.enablePan && handlers.onPanStart) {
        handlers.onPanStart(touch.clientX, touch.clientY)
      }
    } else if (event.touches.length === 2 && mergedConfig.enablePinch) {
      // Two touches - potential pinch
      const touch1 = event.touches[0]
      const touch2 = event.touches[1]

      const distance = Math.sqrt(
        Math.pow(touch2.clientX - touch1.clientX, 2) + Math.pow(touch2.clientY - touch1.clientY, 2)
      )

      initialPinchDistance.value = distance
      currentPinchScale.value = 1
      isPinching.value = true

      if (handlers.onPinchStart) {
        handlers.onPinchStart(1)
      }
    }

    logger.debug('Gesture start', {
      touches: event.touches.length,
      startX: gestureState.startX,
      startY: gestureState.startY,
    })
  }

  const handleTouchMove = (event: TouchEvent) => {
    if (!element || !gestureState.isActive) return

    event.preventDefault()

    if (event.touches.length === 1 && !isPinching.value) {
      // Single touch move - swipe or pan
      const touch = event.touches[0]
      gestureState.currentX = touch.clientX
      gestureState.currentY = touch.clientY
      gestureState.deltaX = touch.clientX - gestureState.startX
      gestureState.deltaY = touch.clientY - gestureState.startY
      gestureState.distance = Math.sqrt(
        gestureState.deltaX * gestureState.deltaX + gestureState.deltaY * gestureState.deltaY
      )

      if (mergedConfig.enablePan && handlers.onPanMove) {
        handlers.onPanMove(touch.clientX, touch.clientY, gestureState.deltaX, gestureState.deltaY)
      }
    } else if (event.touches.length === 2 && isPinching.value && mergedConfig.enablePinch) {
      // Two touch move - pinch
      const touch1 = event.touches[0]
      const touch2 = event.touches[1]

      const distance = Math.sqrt(
        Math.pow(touch2.clientX - touch1.clientX, 2) + Math.pow(touch2.clientY - touch1.clientY, 2)
      )

      const scale = distance / initialPinchDistance.value
      const deltaScale = scale / currentPinchScale.value

      currentPinchScale.value = scale

      if (handlers.onPinchMove) {
        handlers.onPinchMove(scale, deltaScale)
      }
    }
  }

  const handleTouchEnd = (event: TouchEvent) => {
    if (!element) return

    const touchDuration = Date.now() - touchStartTime.value

    if (isPinching.value && event.touches.length === 0) {
      // Pinch ended
      isPinching.value = false
      if (handlers.onPinchEnd) {
        handlers.onPinchEnd(currentPinchScale.value)
      }
    } else if (gestureState.isActive && event.touches.length === 0) {
      // Single touch ended
      gestureState.velocity = calculateVelocity(gestureState.distance, touchDuration)

      // Determine direction
      gestureState.direction = calculateDirection(gestureState.deltaX, gestureState.deltaY)

      // Check for swipe gestures
      if (
        gestureState.distance >= mergedConfig.minSwipeDistance &&
        touchDuration <= mergedConfig.maxSwipeTime &&
        gestureState.velocity >= mergedConfig.velocityThreshold
      ) {
        switch (gestureState.direction) {
          case 'left':
            handlers.onSwipeLeft?.()
            break
          case 'right':
            handlers.onSwipeRight?.()
            break
          case 'up':
            handlers.onSwipeUp?.()
            break
          case 'down':
            handlers.onSwipeDown?.()
            break
        }

        logger.debug('Swipe gesture detected', {
          direction: gestureState.direction,
          distance: gestureState.distance,
          velocity: gestureState.velocity,
        })
      } else if (gestureState.distance < 10 && touchDuration < 300) {
        // Check for tap gestures
        const now = Date.now()
        if (now - lastTapTime.value < 300) {
          // Double tap
          handlers.onDoubleTap?.(gestureState.currentX, gestureState.currentY)
          lastTapTime.value = 0
        } else {
          // Single tap
          handlers.onTap?.(gestureState.currentX, gestureState.currentY)
          lastTapTime.value = now
        }
      }

      if (mergedConfig.enablePan && handlers.onPanEnd) {
        handlers.onPanEnd(gestureState.currentX, gestureState.currentY)
      }

      gestureState.isActive = false
    }
  }

  // Setup event listeners
  const setupEventListeners = () => {
    if (!element) return

    element.addEventListener('touchstart', handleTouchStart, { passive: false })
    element.addEventListener('touchmove', handleTouchMove, { passive: false })
    element.addEventListener('touchend', handleTouchEnd, { passive: false })

    logger.debug('Gesture event listeners attached')
  }

  const removeEventListeners = () => {
    if (!element) return

    element.removeEventListener('touchstart', handleTouchStart)
    element.removeEventListener('touchmove', handleTouchMove)
    element.removeEventListener('touchend', handleTouchEnd)

    logger.debug('Gesture event listeners removed')
  }

  // Auto-setup on mount
  onMounted(() => {
    setupEventListeners()
  })

  // Cleanup on unmount
  onUnmounted(() => {
    removeEventListeners()
  })

  return {
    // State
    gestureState: readonly(gestureState),
    isPinching: readonly(isPinching),
    currentScale: readonly(currentPinchScale),

    // Methods
    setupEventListeners,
    removeEventListeners,

    // Config
    config: mergedConfig,
  }
}
