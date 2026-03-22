<script setup lang="ts">
import { useEditSourceView } from '@/composables/useEditSourceView'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import type { BookSource } from '@/types/source'

const props = withDefaults(defineProps<{
  open?: boolean
  source?: BookSource | null
}>(), {
  open: false
})

const emit = defineEmits<{
  'update:open': [value: boolean]
  'saved': []
}>()

const { jsonText } = useEditSourceView({ props })
</script>

<template>
  <Sheet :open="open" @update:open="emit('update:open', $event)">
    <SheetContent class="w-full sm:max-w-lg flex flex-col h-full rounded-l-xl">
      <SheetHeader class="mb-4">
        <SheetTitle>书源详情</SheetTitle>
      </SheetHeader>

      <div class="flex-1 min-h-0">
        <textarea
          v-model="jsonText"
          class="w-full h-full p-4 rounded-md border bg-muted/30 font-mono text-xs resize-none focus:outline-none focus:ring-2 focus:ring-ring"
          spellcheck="false"
          readonly
        ></textarea>
      </div>

      <SheetFooter class="mt-4">
        <Button class="w-full" variant="outline" @click="emit('update:open', false)">
          关闭
        </Button>
      </SheetFooter>
    </SheetContent>
  </Sheet>
</template>
