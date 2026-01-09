<script setup lang="ts">
/**
 * 书源导入组件 - 增强版
 * 支持：阅读(Legado)书源JSON、订阅源JSON、书源合集包装格式
 */
import { ref } from 'vue'
import { useMessage } from '@/composables/useMessage'
import { 
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Upload, Link, FileJson, AlertCircle, CheckCircle2, XCircle, Rss } from 'lucide-vue-next'
import { $post } from '@/api'


const props = withDefaults(defineProps<{
  open?: boolean
}>(), {
  open: false
})

const emit = defineEmits<{
  'update:open': [value: boolean]
  'success': []
}>()

const message = useMessage()
const loading = ref(false)
const jsonText = ref('')

// 解析结果预览
const parseResult = ref<{
  success: boolean
  count: number
  format: string
  error?: string
  sources?: any[]
} | null>(null)

// 支持的格式类型
const FORMAT_TYPES = {
  NXS: 'Nexus-Lite 标准 (NXS)',
  ARRAY: '标准书源数组 (Legacy)',
  LEGADO_WRAPPER: '阅读合集包装 (Legacy)',
  SUBSCRIPTION: '订阅源格式',
  SINGLE: '单个书源对象 (Legacy)',
  UNKNOWN: '未知格式'
}

/**
 * 智能解析书源JSON
 * 支持多种格式：
 * 1. 标准数组: [{bookSourceUrl, bookSourceName, ...}, ...]
 * 2. 阅读包装: {bookSources: [...], rssSource: [...], ...}
 * 3. 订阅源: 带有 sourceUrl/sourceName 的格式
 * 4. 单个对象: {bookSourceUrl, bookSourceName, ...}
 */
function parseSourceJson(text: string): { success: boolean; sources: any[]; format: string; error?: string } {
  try {
    const trimmed = text.trim()
    if (!trimmed) {
      return { success: false, sources: [], format: FORMAT_TYPES.UNKNOWN, error: '内容为空' }
    }

    let data: any
    try {
      data = JSON.parse(trimmed)
    } catch (e) {
      return { success: false, sources: [], format: FORMAT_TYPES.UNKNOWN, error: 'JSON格式错误' }
    }
    // Case 0: Nexus-Lite (NXS) 格式识别
    if (data.id && data.search && data.book && data.content) {
      return { success: true, sources: [data], format: FORMAT_TYPES.NXS }
    }

    // Case 1: 标准数组
    if (Array.isArray(data)) {
      // 检查是否是书源数组
      if (data.length > 0 && (data[0].bookSourceUrl || data[0].sourceUrl)) {
        // 统一转换格式
        const sources = data.map(normalizeSource)
        return { success: true, sources, format: FORMAT_TYPES.ARRAY }
      }
      return { success: true, sources: data, format: FORMAT_TYPES.ARRAY }
    }

    // Case 2: 阅读合集包装格式 (通常包含 bookSources 字段)
    if (data.bookSources && Array.isArray(data.bookSources)) {
      const sources = data.bookSources.map(normalizeSource)
      return { success: true, sources, format: FORMAT_TYPES.LEGADO_WRAPPER }
    }

    // Case 3: 可能的订阅源包装
    if (data.sources && Array.isArray(data.sources)) {
      const sources = data.sources.map(normalizeSource)
      return { success: true, sources, format: FORMAT_TYPES.SUBSCRIPTION }
    }

    // Case 4: 单个书源对象
    if (data.bookSourceUrl || data.sourceUrl) {
      return { success: true, sources: [normalizeSource(data)], format: FORMAT_TYPES.SINGLE }
    }

    // 尝试查找任何包含书源数组的字段
    for (const key of Object.keys(data)) {
      if (Array.isArray(data[key]) && data[key].length > 0) {
        const first = data[key][0]
        if (first.bookSourceUrl || first.sourceUrl || first.bookSourceName) {
          const sources = data[key].map(normalizeSource)
          return { success: true, sources, format: `${FORMAT_TYPES.LEGADO_WRAPPER} (${key})` }
        }
      }
    }

    return { success: false, sources: [], format: FORMAT_TYPES.UNKNOWN, error: '无法识别的格式' }
  } catch (e: any) {
    return { success: false, sources: [], format: FORMAT_TYPES.UNKNOWN, error: e.message }
  }
}

/**
 * 统一书源格式（兼容不同命名规范）
 */
function normalizeSource(source: any): any {
  // 如果已经是标准格式，直接返回
  if (source.bookSourceUrl) {
    return source
  }

  // 订阅源格式转换
  if (source.sourceUrl) {
    return {
      bookSourceUrl: source.sourceUrl,
      bookSourceName: source.sourceName || source.name || '未知书源',
      bookSourceGroup: source.sourceGroup || source.group || '',
      enabled: source.enabled !== false,
      ...source // 保留其他字段
    }
  }

  return source
}

/**
 * 预览解析结果
 */
function previewParse() {
  if (!jsonText.value.trim()) {
    parseResult.value = null
    return
  }
  
  const result = parseSourceJson(jsonText.value)
  parseResult.value = {
    success: result.success,
    count: result.sources.length,
    format: result.format,
    error: result.error,
    sources: result.sources
  }
}

async function handleImport() {
  loading.value = true
  try {
    const sourceText = jsonText.value
    
    if (!sourceText.trim()) {
      message.warning('请输入书源内容')
      return
    }

    // 解析
    const result = parseSourceJson(sourceText)
    if (!result.success) {
      message.error(result.error || '解析失败')
      return
    }

    if (result.sources.length === 0) {
      message.warning('未找到有效书源')
      return
    }

    // 调用 Nexus-lite 的添加接口
    let successCount = 0
    for (const source of result.sources) {
      try {
        // 注：Nexus-lite 目前可能只支持标准 NXS 格式的直接添加
        const res = await $post('/sources', source)
        if (res.isSuccess) successCount++
      } catch (e) {
        console.error('Import failed for', source.name, e)
      }
    }

    if (successCount > 0) {
      message.success(`成功导入 ${successCount} 个书源`)
      emit('success')
      emit('update:open', false)
      jsonText.value = ''
      parseResult.value = null
    } else {
      message.error('导入失败，请检查书源格式是否符合 Nexus-Lite (NXS) 标准')
    }
  } catch (err: any) {
    message.error('导入出错: ' + (err.message || '未知错误'))
  } finally {
    loading.value = false
  }
}

// 拖拽相关
const isDragging = ref(false)

function onDrop(e: DragEvent) {
  isDragging.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) {
    readFile(file)
  }
}

function readFile(file: File) {
  const reader = new FileReader()
  reader.onload = (e) => {
    jsonText.value = e.target?.result as string
    previewParse()
  }
  reader.readAsText(file)
}

function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) readFile(file)
}

// 当输入变化时预览
function onInputChange() {
  // 防抖预览
  setTimeout(previewParse, 300)
}
</script>

<template>
  <Sheet :open="open" @update:open="emit('update:open', $event)">
    <SheetContent class="w-full sm:max-w-lg flex flex-col h-full">
      <SheetHeader class="mb-4">
        <SheetTitle>导入书源</SheetTitle>
        <p class="text-sm text-muted-foreground">直接粘贴书源 JSON 代码，或导入本地 .nxs 文件</p>
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
             <div class="flex items-center justify-between px-3 py-2 border-b border-border/50 bg-background/50 backdrop-blur-sm rounded-t-xl">
                <span class="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <FileJson class="w-3.5 h-3.5" />
                  JSON 源文本
                </span>
                <label class="cursor-pointer">
                    <input type="file" accept=".json,.txt" class="hidden" @change="onFileChange">
                    <span class="inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-md bg-transparent hover:bg-primary/10 text-primary hover:text-primary transition-colors font-medium border border-transparent hover:border-primary/20">
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
Example: { "id": "...", "name": "...", "url": "..." }'
              @input="onInputChange"
              @dragenter="isDragging = true"
              @dragleave="isDragging = false"
              @drop="onDrop"
            ></textarea>
          </div>
        </div>

        <!-- 解析预览 -->
        <div v-if="parseResult" class="p-4 rounded-xl border" :class="parseResult.success ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'">
          <div class="flex items-start gap-3">
            <CheckCircle2 v-if="parseResult.success" class="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
            <XCircle v-else class="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-medium text-sm" :class="parseResult.success ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'">
                  {{ parseResult.success ? '解析成功' : '解析失败' }}
                </span>
                <Badge v-if="parseResult.success" variant="secondary" class="text-xs">
                  {{ parseResult.format }}
                </Badge>
              </div>
              <p class="text-xs mt-1" :class="parseResult.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
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
