<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next'

interface Props {
  size?: 'sm' | 'md' | 'lg'
  text?: string
  className?: string
}

const props = withDefaults(defineProps<Props>(), {
  size: 'md',
  text: undefined,
  className: '',
})

const sizeClasses = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
}
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-3" :class="className">
    <Loader2 :class="[sizeClasses[size], 'animate-spin text-primary']" />
    <p v-if="text" class="text-sm text-muted-foreground">{{ text }}</p>
  </div>
</template>
