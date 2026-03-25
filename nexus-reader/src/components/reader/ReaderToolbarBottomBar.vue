<script setup lang="ts">
import ReaderNavigation from './ReaderNavigation.vue'
import ReaderProgress from './ReaderProgress.vue'
import ReaderToolbarBottomActions from './ReaderToolbarBottomActions.vue'
import {
  createReaderToolbarBottomBarBindings,
  type ReaderToolbarBottomBarEmits,
  type ReaderToolbarBottomBarProps,
} from './toolbar-bottom-bar'

const props = defineProps<ReaderToolbarBottomBarProps>()
const emit = defineEmits<ReaderToolbarBottomBarEmits>()
const {
  readingProgress,
  navigationProps,
  actionProps,
} = createReaderToolbarBottomBarBindings(props)
</script>

<template>
  <Transition name="slide-up">
    <footer
      v-show="show && !zenMode"
      class="fixed bottom-0 inset-x-0 z-40"
      @click.stop
    >
      <div
        class="reader-toolbar-glass mx-3 mb-3 rounded-2xl shadow-premium overflow-hidden border border-white/10"
      >
        <div class="px-5 pt-5 pb-4">
          <ReaderNavigation
            v-bind="navigationProps"
            @prev="emit('prevChapter')"
            @next="emit('nextChapter')"
          />

          <div class="mt-4">
            <ReaderProgress :progress="readingProgress" />
          </div>
        </div>
        <ReaderToolbarBottomActions
          v-bind="actionProps"
          @toggle-day-night="emit('toggleDayNight')"
          @toggle-settings="emit('toggleSettings')"
          @toggle-eye-care="emit('toggleEyeCare')"
          @toggle-zen-mode="emit('toggleZenMode')"
          @refresh="emit('refresh')"
          @open-source-picker="emit('openSourcePicker')"
          @open-book-info="emit('openBookInfo')"
          @toggle-decoder="emit('toggleDecoder', $event)"
          @open-decoder-settings="emit('openDecoderSettings')"
        />
      </div>
    </footer>
  </Transition>
</template>
