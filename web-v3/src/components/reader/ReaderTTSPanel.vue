<script setup lang="ts">
/**
 * 阅读器 TTS 控制面板组件
 */
import { X, Pause, Play } from 'lucide-vue-next'
import { useReaderStore } from '@/stores/reader'
import { useTTS } from '@/composables/useTTS'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  'update:show': [value: boolean]
  'stop': []
}>()

const readerStore = useReaderStore()
const tts = useTTS()

const isActive = computed(() => tts.isSpeaking.value || tts.isPaused.value)
</script>

<template>
  <Transition name="slide-up">
    <div
      v-if="show && isActive"
      class="fixed bottom-20 inset-x-0 z-30 flex justify-center"
      @click.stop
    >
      <div class="tts-panel toolbar-glass mx-3 px-4 py-3 rounded-2xl shadow-lg w-full max-w-screen-md">
        <div class="flex items-center gap-4">
          <!-- 播放/暂停按钮 -->
          <button
            class="tts-play-btn w-10 h-10 rounded-full flex items-center justify-center shrink-0"
            @click="tts.toggle()"
          >
            <Pause v-if="tts.isSpeaking.value && !tts.isPaused.value" class="w-5 h-5" />
            <Play v-else class="w-5 h-5" />
          </button>

          <!-- 进度信息 -->
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium truncate">正在朗读</div>
            <div class="text-xs opacity-60 truncate">
              {{ readerStore.currentChapter?.title }}
            </div>
          </div>

          <!-- 语速调节 -->
          <div class="hidden sm:flex items-center gap-2 text-xs shrink-0">
            <span class="opacity-60">语速</span>
            <button
              class="tts-rate-btn px-2 py-1 rounded"
              :class="{ 'active': tts.rate.value === 0.75 }"
              @click="tts.setRate(0.75)"
            >
              慢
            </button>
            <button
              class="tts-rate-btn px-2 py-1 rounded"
              :class="{ 'active': tts.rate.value === 1 }"
              @click="tts.setRate(1)"
            >
              中
            </button>
            <button
              class="tts-rate-btn px-2 py-1 rounded"
              :class="{ 'active': tts.rate.value === 1.5 }"
              @click="tts.setRate(1.5)"
            >
              快
            </button>
          </div>

          <!-- 停止按钮 -->
          <button
            class="w-8 h-8 rounded-full hover:opacity-70 flex items-center justify-center shrink-0 opacity-60"
            @click="emit('stop')"
          >
            <X class="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.toolbar-glass {
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

:global(.dark) .toolbar-glass {
  background: rgba(0, 0, 0, 0.85);
  border-color: rgba(255, 255, 255, 0.1);
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s ease;
}

.slide-up-enter-from {
  opacity: 0;
  transform: translateY(100%);
}

.slide-up-leave-to {
  opacity: 0;
  transform: translateY(100%);
}

.tts-play-btn {
  background: currentColor;
  color: inherit;
  opacity: 0.9;
}

.tts-play-btn:hover {
  opacity: 1;
}

/* 使用反色文字 */
:global(.theme-white) .tts-play-btn,
:global(.theme-paper) .tts-play-btn,
:global(.theme-sepia) .tts-play-btn,
:global(.theme-gray) .tts-play-btn,
:global(.theme-green) .tts-play-btn {
  background: rgba(0, 0, 0, 0.8);
  color: #fff;
}

:global(.theme-night) .tts-play-btn {
  background: rgba(255, 255, 255, 0.9);
  color: #1c1c1e;
}

.tts-rate-btn {
  background: rgba(0, 0, 0, 0.08);
  transition: all 0.2s ease;
}

.tts-rate-btn:hover {
  background: rgba(0, 0, 0, 0.12);
}

.tts-rate-btn.active {
  background: rgba(0, 0, 0, 0.2);
  font-weight: 600;
}

:global(.theme-night) .tts-rate-btn {
  background: rgba(255, 255, 255, 0.1);
}

:global(.theme-night) .tts-rate-btn:hover {
  background: rgba(255, 255, 255, 0.15);
}

:global(.theme-night) .tts-rate-btn.active {
  background: rgba(255, 255, 255, 0.25);
}
</style>
