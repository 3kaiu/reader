<script setup lang="ts">
import { Save } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'

const emit = defineEmits<{
  close: []
  save: []
}>()
</script>

<template>
  <div class="flex items-center gap-3 pt-4">
    <Button class="flex-1 gap-2" @click="emit('save')">
      <Save class="h-4 w-4" />
      保存
    </Button>
    <Button
      variant="outline"
      class="flex-1"
      @click="emit('close')"
    >
      取消
    </Button>
  </div>
</template>
