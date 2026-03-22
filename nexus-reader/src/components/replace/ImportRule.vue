<script setup lang="ts">
import { useImportRuleView } from '@/composables/useImportRuleView'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Upload } from 'lucide-vue-next'

const props = withDefaults(defineProps<{
  open?: boolean
}>(), {
  open: false
})

const emit = defineEmits<{
  'update:open': [value: boolean]
  'success': []
}>()

const { loading, jsonText, onFileChange, handleImport } = useImportRuleView({
  close: () => emit('update:open', false),
  notifySuccess: () => emit('success'),
})

</script>

<template>
  <Sheet :open="open" @update:open="emit('update:open', $event)">
    <SheetContent class="w-full sm:max-w-md flex flex-col h-full rounded-l-xl">
      <SheetHeader class="mb-4">
        <SheetTitle>导入替换规则</SheetTitle>
      </SheetHeader>

      <div class="flex-1 flex flex-col gap-3 min-h-0">
        <div class="relative flex-1">
          <textarea
            v-model="jsonText"
            class="w-full h-full p-3 rounded-md border bg-transparent resize-none focus:outline-none focus:ring-2 focus:ring-ring text-xs font-mono"
            placeholder='[{"name":"规则名","pattern":"原文","replacement":"替换后文本","scope":"source-id","isEnabled":true,"isRegex":false}]'
          ></textarea>
        </div>

        <div class="flex items-center justify-between">
          <span class="text-xs text-muted-foreground">仅支持 ReplaceRule JSON，`scope` 只接受书源 ID 或留空</span>
          <label class="cursor-pointer">
            <input type="file" accept=".json,.txt" class="hidden" @change="onFileChange">
            <span class="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-secondary hover:bg-secondary/80 transition-colors">
              <Upload class="h-3 w-3" />
              选择文件
            </span>
          </label>
        </div>
      </div>

      <SheetFooter class="mt-4">
        <Button class="w-full" :disabled="loading" @click="handleImport">
          {{ loading ? '导入中...' : '确认导入' }}
        </Button>
      </SheetFooter>
    </SheetContent>
  </Sheet>
</template>
