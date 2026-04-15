<script setup lang="ts">
import { createReaderNavigationButtonViewBindings } from './reader-navigation-button-view-bindings'
import type { ReaderNavigationButtonProps } from './reader-navigation-button-view-bindings'

const props = defineProps<ReaderNavigationButtonProps>()
const { buttonClass, onClick } = createReaderNavigationButtonViewBindings(props)
</script>

<template>
  <button :disabled="disabled" class="chapter-nav-btn" :class="buttonClass" @click="onClick">
    <slot name="before" />
    <span><slot /></span>
    <slot name="after" />
  </button>
</template>

<style scoped>
.chapter-nav-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: rgba(var(--foreground-rgb), 0.05);
  border: 1px solid rgba(var(--foreground-rgb), 0.1);
  border-radius: 99px;
  font-size: 0.75rem;
  font-weight: 500;
  transition: all 0.2s;
}

.chapter-nav-btn:not(.disabled):active {
  background: rgba(var(--foreground-rgb), 0.1);
  transform: translateY(1px);
}

.chapter-nav-btn.disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
</style>
