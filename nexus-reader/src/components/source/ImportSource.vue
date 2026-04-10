<script setup lang="ts">
/**
 * 书源导入组件
 * 仅支持 Nexus-Lite NXS 书源定义
 */
import { useImportSourceView } from '@/composables/useImportSourceView'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Upload, FileJson, CheckCircle2, XCircle } from 'lucide-vue-next'

withDefaults(
  defineProps<{
    open?: boolean
  }>(),
  {
    open: false,
  }
)

const emit = defineEmits<{
  'update:open': [value: boolean]
  success: []
}>()

const {
  loading,
  jsonText,
  parseResult,
  isDragging,
  onFileChange,
  handleImport,
  onDrop,
  onInputChange,
} = useImportSourceView({
  close: () => emit('update:open', false),
  notifySuccess: () => emit('success'),
})
</script>

<template>
  <Sheet :open="open" @update:open="emit('update:open', $event)">
    <SheetContent class="w-full sm:max-w-lg flex flex-col h-full">
      <SheetHeader class="mb-4">
        <SheetTitle>导入书源</SheetTitle>
        <p class="text-sm text-muted-foreground">
          仅支持粘贴或导入符合 Nexus-Lite NXS 结构的 JSON 文件
        </p>
      </SheetHeader>

      <div class="flex-1 flex flex-col gap-4 overflow-hidden">
        <!-- 文本/文件导入区域 -->
        <div class="flex-1 flex flex-col min-h-0 relative group">
          <div
            class="absolute inset-0 rounded-xl border-2 border-dashed border-muted-foreground/20 bg-muted/30 transition-colors group-hover:border-muted-foreground/30 pointer-events-none"
            :class="{ 'border-primary/50 bg-primary/5': isDragging }"
          />

          <div class="relative flex-1 z-10 flex flex-col">
            <!-- Toolbar / Header -->
            <div
              class="flex items-center justify-between px-3 py-2 border-b border-border/50 bg-background/50 backdrop-blur-sm rounded-t-xl"
            >
              <span class="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <FileJson class="w-3.5 h-3.5" />
                JSON 源文本
              </span>
              <label class="cursor-pointer">
                <input type="file" accept=".json,.txt" class="hidden" @change="onFileChange" />
                <span
                  class="inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-md bg-transparent hover:bg-primary/10 text-primary hover:text-primary transition-colors font-medium border border-transparent hover:border-primary/20"
                >
                  <Upload class="h-3 w-3" />
                  导入文件
                </span>
              </label>
            </div>

            <!-- Editor Area -->
            <textarea
              v-model="jsonText"
              class="flex-1 w-full p-4 bg-transparent resize-none focus:outline-none text-xs font-mono leading-relaxed placeholder:text-muted-foreground/40"
              placeholder='在此粘贴书源 JSON 内容...
Example: { "$v": 1, "id": "...", "name": "...", "url": "...", "search": { ... }, "book": { ... }, "toc": { ... }, "content": { ... } }'
              @input="onInputChange"
              @dragenter="isDragging = true"
              @dragleave="isDragging = false"
              @drop="onDrop"
            ></textarea>
          </div>
        </div>

        <!-- 解析预览 -->
        <div
          v-if="parseResult"
          class="p-4 rounded-xl border"
          :class="
            parseResult.success
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
              : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
          "
        >
          <div class="flex items-start gap-3">
            <CheckCircle2
              v-if="parseResult.success"
              class="h-5 w-5 text-green-500 shrink-0 mt-0.5"
            />
            <XCircle v-else class="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span
                  class="font-medium text-sm"
                  :class="
                    parseResult.success
                      ? 'text-green-700 dark:text-green-300'
                      : 'text-red-700 dark:text-red-300'
                  "
                >
                  {{ parseResult.success ? '解析成功' : '解析失败' }}
                </span>
                <Badge v-if="parseResult.success" variant="secondary" class="text-xs">
                  {{ parseResult.format }}
                </Badge>
              </div>
              <p
                class="text-xs mt-1"
                :class="
                  parseResult.success
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                "
              >
                {{ parseResult.success ? `共发现 ${parseResult.count} 个书源` : parseResult.error }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <SheetFooter class="mt-4">
        <Button
          class="w-full"
          size="lg"
          :disabled="loading || (parseResult && !parseResult.success)"
          @click="handleImport"
        >
          {{ loading ? '导入中...' : '确认导入' }}
        </Button>
      </SheetFooter>
    </SheetContent>
  </Sheet>
</template>
