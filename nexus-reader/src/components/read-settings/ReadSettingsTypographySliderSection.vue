<script setup lang="ts">
import { Minus, Plus } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'

interface Props {
  title: string
  valueLabel: string
  modelValue: number[]
  min: number
  max: number
  step: number
  showStepper?: boolean
}

withDefaults(defineProps<Props>(), {
  showStepper: false,
})

const emit = defineEmits<{
  'update:model-value': [values: number[]]
  decrease: []
  increase: []
}>()
</script>

<template>
  <section>
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-sm font-medium">{{ title }}</h3>
      <span class="text-sm text-muted-foreground">{{ valueLabel }}</span>
    </div>
    <div class="flex items-center gap-3">
      <Button
        v-if="showStepper"
        variant="outline"
        size="icon"
        class="h-9 w-9"
        @click="emit('decrease')"
      >
        <Minus class="h-4 w-4" />
      </Button>
      <Slider
        :model-value="modelValue"
        :min="min"
        :max="max"
        :step="step"
        class="flex-1 w-full"
        @update:model-value="emit('update:model-value', $event)"
      />
      <Button
        v-if="showStepper"
        variant="outline"
        size="icon"
        class="h-9 w-9"
        @click="emit('increase')"
      >
        <Plus class="h-4 w-4" />
      </Button>
    </div>
  </section>
</template>
