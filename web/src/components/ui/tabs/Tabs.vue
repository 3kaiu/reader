<script setup lang="ts">
import { type HTMLAttributes, provide, ref, watch } from 'vue'

const props = defineProps<{
  modelValue?: string
  defaultValue?: string
  class?: HTMLAttributes['class']
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const activeTab = ref(props.modelValue ?? props.defaultValue ?? '')

watch(
  () => props.modelValue,
  newVal => {
    if (newVal !== undefined) {
      activeTab.value = newVal
    }
  }
)

watch(activeTab, newVal => {
  emit('update:modelValue', newVal)
})

provide('tabs-active', activeTab)
provide('tabs-set-active', (value: string) => {
  activeTab.value = value
})
</script>

<template>
  <div :class="props.class">
    <slot />
  </div>
</template>
