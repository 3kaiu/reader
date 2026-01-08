<script setup lang="ts">
/**
 * 阅读器 TTS 控制面板组件
 * 包含播放/暂停、语速调节、睡眠定时器
 */
import { Pause, Play, X, Settings2 } from 'lucide-vue-next'

interface Props {
  show: boolean
  isSpeaking: boolean
  isPaused: boolean
  currentRate: number
  chapterTitle?: string
  sleepTimerRemaining: number
  formattedRemainingTime: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  toggle: []
  setRate: [rate: number]
  setTimer: [minutes: number]
  cancelTimer: []
  stop: []
  'open-voice-settings': []
}>()
</script>

<template>
  <Transition name="slide-up">
    <div 
      v-if="show && (isSpeaking || isPaused)"
      class="fixed bottom-20 inset-x-0 z-30 flex justify-center"
      @click.stop
    >
      <div class="tts-panel toolbar-glass mx-3 px-3 py-2.5 rounded-2xl shadow-lg w-full max-w-screen-md">
        <div class="flex items-center gap-2 sm:gap-3">
          <!-- 播放/暂停按钮 -->
          <button 
            class="tts-play-btn w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center shrink-0"
            @click="emit('toggle')"
          >
            <Pause v-if="isSpeaking && !isPaused" class="w-4 h-4 sm:w-5 sm:h-5" />
            <Play v-else class="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
          
          <!-- 进度信息 (移动端隐藏，桌面端显示) -->
          <div class="hidden sm:block flex-1 min-w-0">
            <div class="text-sm font-medium truncate">正在朗读</div>
            <div class="text-xs opacity-60 truncate">{{ chapterTitle }}</div>
          </div>
          
          <!-- 语速调节 (紧凑按钮组) -->
          <div class="flex items-center bg-muted/50 rounded-lg p-0.5 shrink-0">
            <button 
              v-for="rate in [0.75, 1, 1.25, 1.5]"
              :key="rate"
              class="px-1.5 sm:px-2 py-1 text-[10px] sm:text-xs rounded transition-colors"
              :class="currentRate === rate ? 'bg-background shadow-sm font-medium' : 'opacity-60 hover:opacity-100'"
              @click="emit('setRate', rate)"
            >{{ rate }}x</button>
          </div>
          
          <!-- 睡眠定时器 (紧凑按钮组) -->
          <div class="flex items-center gap-1 shrink-0">
            <template v-if="sleepTimerRemaining > 0">
              <span class="text-[10px] sm:text-xs font-mono text-amber-500">{{ formattedRemainingTime }}</span>
              <button 
                class="w-5 h-5 sm:w-6 sm:h-6 rounded-full hover:bg-muted flex items-center justify-center text-xs"
                @click="emit('cancelTimer')"
              >✕</button>
            </template>
            <template v-else>
              <button 
                v-for="m in [15, 30, 60]"
                :key="m"
                class="px-1.5 sm:px-2 py-1 text-[10px] sm:text-xs rounded bg-muted/50 hover:bg-muted transition-colors"
                @click="emit('setTimer', m)"
              >{{ m }}m</button>
            </template>
          </div>

          <!-- 停止按钮 -->
          <button 
            class="w-7 h-7 sm:w-8 sm:h-8 rounded-full hover:opacity-70 flex items-center justify-center shrink-0 opacity-60"
            @click="emit('stop')"
          >
            <X class="w-3.5 h-3.5 sm:w-4 h-4" />
          </button>

          <!-- 语音设置按钮 -->
          <button 
            class="w-7 h-7 sm:w-8 sm:h-8 rounded-full hover:bg-muted flex items-center justify-center shrink-0 opacity-60"
            @click="emit('open-voice-settings')"
          >
            <Settings2 class="w-3.5 h-3.5 sm:w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.toolbar-glass {
  background: rgba(var(--background-rgb), 0.85);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(var(--foreground-rgb), 0.1);
}

.tts-play-btn {
  background: var(--primary);
  color: var(--primary-foreground);
  transition: all 0.2s;
}

.tts-play-btn:active {
  transform: scale(0.9);
}

.bg-muted\/50 {
  background-color: rgba(var(--foreground-rgb), 0.05);
}

.bg-background {
  background-color: rgb(var(--background-rgb));
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.3s ease-out, opacity 0.3s ease-out;
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(20px);
  opacity: 0;
}
</style>
