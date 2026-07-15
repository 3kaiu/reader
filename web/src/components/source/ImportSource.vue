<script setup lang="ts">
/**
 * 书源导入组件
 * 支持 Nexus-Lite NXS 和 Legado 书源定义
 */
import { computed, onUnmounted, ref } from 'vue'
import { useImportSourceView } from '@/composables/useImportSourceView'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Upload, FileJson, CheckCircle2, XCircle, Link2, Plus, X, Loader2 } from 'lucide-vue-next'
import { useMessage } from '@/composables/useMessage'
import { sourceApi } from '@/api/source'
import { useSourceStore } from '@/stores/source'

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

// URL import state
const importMode = ref<'text' | 'url'>('text')
const urlImportLoading = ref(false)
const urlList = ref<string[]>([''])
const urlResults = ref<{ url: string; count: number }[]>([])

function addUrlField() {
  urlList.value.push('')
}

function removeUrlField(index: number) {
  if (urlList.value.length > 1) {
    urlList.value.splice(index, 1)
  }
}

const hasValidUrls = computed(() => urlList.value.some(u => u.trim()))

// AbortController for URL import cancellation
let urlImportAbortController: AbortController | null = null

async function handleUrlImport() {
  const urls = urlList.value.filter(u => u.trim())
  if (urls.length === 0) {
    return
  }

  // Cancel any ongoing import
  if (urlImportAbortController) {
    urlImportAbortController.abort()
  }
  urlImportAbortController = new AbortController()

  urlImportLoading.value = true
  urlResults.value = []
  const sourceStore = useSourceStore()

  try {
    // Import URLs one by one for better progress tracking
    for (const url of urls) {
      // Check if cancelled
      if (urlImportAbortController.signal.aborted) {
        break
      }
      try {
        const result = await sourceApi.importLegadoSourcesFromUrl(url.trim())
        if (result.isSuccess && result.data) {
          urlResults.value.push({
            url: url.trim(),
            count: result.data.length,
          })
        }
      } catch (error: unknown) {
        // Skip if aborted
        if (urlImportAbortController.signal.aborted) break
        urlResults.value.push({
          url: url.trim(),
          count: -1,
        })
      }
    }

    // Refresh sources only if not cancelled
    if (!urlImportAbortController.signal.aborted) {
      await sourceStore.loadSources(true)
    }

    const successCount = urlResults.value.filter(r => r.count >= 0).length
    const totalCount = urlResults.value.length
    const totalSources = urlResults.value.reduce((sum, r) => sum + Math.max(0, r.count), 0)

    const message = useMessage()
    if (successCount === totalCount) {
      message.success(`成功从 ${totalCount} 个 URL 导入 ${totalSources} 个书源`)
      emit('success')
      // Clear URLs on success
      urlList.value = ['']
      urlResults.value = []
    } else {
      message.warning(
        `部分导入成功：${successCount}/${totalCount} 个 URL，共 ${totalSources} 个书源`
      )
    }
  } catch (error: unknown) {
    const message = useMessage()
    message.error('URL 导入出错: ' + ((error as Error)?.message || '未知错误'))
  } finally {
    urlImportLoading.value = false
  }
}

// Cleanup on unmount
onUnmounted(() => {
  if (urlImportAbortController) {
    urlImportAbortController.abort()
  }
})
</script>

<template>
  <Sheet :open="open" @update:open="emit('update:open', $event)">
    <SheetContent class="w-full sm:max-w-lg flex flex-col h-full">
      <SheetHeader class="mb-4">
        <SheetTitle>导入书源</SheetTitle>
        <p class="text-sm text-muted-foreground">支持 Legado 和 Nexus-Lite NXS 书源</p>
      </SheetHeader>

      <Tabs v-model:model-value="importMode" class="flex-1 flex flex-col overflow-hidden">
        <TabsList class="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="text">粘贴/文件</TabsTrigger>
          <TabsTrigger value="url">URL 导入</TabsTrigger>
        </TabsList>

        <TabsContent value="text" class="flex-1 flex flex-col gap-4 overflow-hidden m-0">
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
                  <input type="file" accept=".json,.txt,.legado" class="hidden" @change="onFileChange" />
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
支持 Legado 书源格式和 NXS 格式
Example: [{"bookSourceUrl": "...", "bookSourceName": "..."}]'
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

          <SheetFooter class="mt-auto">
            <Button
              class="w-full"
              size="lg"
              :disabled="loading || !!parseResult && !parseResult.success"
              @click="handleImport"
            >
              {{ loading ? '导入中...' : '确认导入' }}
            </Button>
          </SheetFooter>
        </TabsContent>

        <TabsContent value="url" class="flex-1 flex flex-col gap-4 overflow-hidden m-0">
          <div class="flex-1 flex flex-col gap-3 overflow-y-auto">
            <p class="text-xs text-muted-foreground">
              输入 Legado 书源 JSON 的 URL，支持批量导入
            </p>

            <!-- URL Input Fields -->
            <div class="space-y-2">
              <div
                v-for="(_, index) in urlList"
                :key="index"
                class="flex items-center gap-2"
              >
                <div class="flex-1 relative">
                  <Link2
                    class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground"
                  />
                  <input
                    v-model="urlList[index]"
                    type="url"
                    placeholder="https://example.com/sources.json"
                    class="w-full h-9 pl-9 pr-3 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <Button
                  v-if="urlList.length > 1"
                  variant="ghost"
                  size="icon"
                  class="h-9 w-9 shrink-0"
                  @click="removeUrlField(index)"
                >
                  <X class="h-4 w-4" />
                </Button>
              </div>
            </div>

            <!-- Add URL Button -->
            <Button
              variant="outline"
              size="sm"
              class="w-full gap-2"
              @click="addUrlField"
            >
              <Plus class="h-4 w-4" />
              添加更多 URL
            </Button>

            <!-- Import Results -->
            <div
              v-if="urlResults.length > 0"
              class="p-3 rounded-xl border bg-muted/50 space-y-2"
            >
              <div
                v-for="(result, index) in urlResults"
                :key="index"
                class="flex items-center gap-2 text-xs"
              >
                <CheckCircle2
                  v-if="result.count >= 0"
                  class="h-4 w-4 text-green-500 shrink-0"
                />
                <XCircle v-else class="h-4 w-4 text-red-500 shrink-0" />
                <span class="flex-1 truncate" :title="result.url">
                  {{ result.url }}
                </span>
                <Badge
                  :variant="result.count >= 0 ? 'secondary' : 'destructive'"
                  class="text-xs shrink-0"
                >
                  {{ result.count >= 0 ? `${result.count} 个` : '失败' }}
                </Badge>
              </div>
            </div>
          </div>

          <SheetFooter class="mt-auto">
            <Button
              class="w-full"
              size="lg"
              :disabled="urlImportLoading || !hasValidUrls"
              @click="handleUrlImport"
            >
              <Loader2 v-if="urlImportLoading" class="h-4 w-4 animate-spin" />
              {{ urlImportLoading ? '导入中...' : '从 URL 导入' }}
            </Button>
          </SheetFooter>
        </TabsContent>
      </Tabs>
    </SheetContent>
  </Sheet>
</template>
