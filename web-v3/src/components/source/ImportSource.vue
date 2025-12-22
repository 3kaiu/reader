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
import SourceSubscription from './SourceSubscription.vue'

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
const activeTab = ref<'text' | 'url' | 'subscribe'>('text')
const jsonText = ref('')
const urlText = ref('')

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
  ARRAY: '标准书源数组',
  LEGADO_WRAPPER: '阅读合集包装',
  SUBSCRIPTION: '订阅源格式',
  SINGLE: '单个书源对象',
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
  const text = activeTab.value === 'text' ? jsonText.value : urlText.value
  if (!text.trim()) {
    parseResult.value = null
    return
  }
  
  const result = parseSourceJson(text)
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
    let sourceText = activeTab.value === 'text' ? jsonText.value : ''
    
    // 如果是URL，通过后端 readRemoteSourceFile API 获取内容
    if (activeTab.value === 'url' && urlText.value.trim()) {
      try {
        const res = await $post<string[]>('/readRemoteSourceFile', { url: urlText.value.trim() })
        if (res.isSuccess && res.data && res.data.length > 0) {
          // 后端返回的是字符串数组，需要解析每个字符串
          let allSources: any[] = []
          for (const jsonStr of res.data) {
            try {
              const parsed = JSON.parse(jsonStr)
              if (Array.isArray(parsed)) {
                allSources = allSources.concat(parsed)
              } else if (parsed && typeof parsed === 'object') {
                // 可能是包装格式或单个对象
                const result = parseSourceJson(jsonStr)
                if (result.success) {
                  allSources = allSources.concat(result.sources)
                }
              }
            } catch {
              // 解析单个字符串失败，跳过
            }
          }
          
          if (allSources.length === 0) {
            message.error('远程书源文件格式错误')
            return
          }
          
          // 调用批量保存API
          const saveRes = await $post('/saveBookSources', allSources)
          if (saveRes.isSuccess) {
            message.success(`导入成功！共 ${allSources.length} 个书源`)
            emit('success')
            emit('update:open', false)
            urlText.value = ''
            parseResult.value = null
          } else {
            message.error(saveRes.errorMsg || '导入失败')
          }
          return
        } else {
          message.error(res.errorMsg || '无法获取远程书源内容')
          return
        }
      } catch (err: any) {
        message.error('获取远程书源失败: ' + (err.message || '未知错误'))
        return
      }
    }

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

    // 调用批量保存API
    const res = await $post('/saveBookSources', result.sources)
    if (res.isSuccess) {
      message.success(`导入成功！共 ${result.sources.length} 个书源 (${result.format})`)
      emit('success')
      emit('update:open', false)
      jsonText.value = ''
      urlText.value = ''
      parseResult.value = null
    } else {
      message.error(res.errorMsg || '导入失败')
    }
  } catch (err: any) {
    message.error('导入出错: ' + (err.message || '未知错误'))
  } finally {
    loading.value = false
  }
}

function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  
  const reader = new FileReader()
  reader.onload = (e) => {
    jsonText.value = e.target?.result as string
    activeTab.value = 'text'
    previewParse()
  }
  reader.readAsText(file)
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
        <p class="text-sm text-muted-foreground">支持阅读(Legado)书源、订阅源、书源合集等多种格式</p>
      </SheetHeader>

      <div class="flex-1 flex flex-col gap-4 overflow-hidden">
        <!-- Tabs -->
        <div class="grid grid-cols-3 p-1 bg-muted rounded-lg">
          <button 
            class="px-3 py-2 text-sm font-medium rounded-md transition-all flex items-center justify-center gap-2"
            :class="activeTab === 'text' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:bg-background/50'"
            @click="activeTab = 'text'"
          >
            <FileJson class="h-4 w-4" />
            文本
          </button>
          <button 
            class="px-3 py-2 text-sm font-medium rounded-md transition-all flex items-center justify-center gap-2"
            :class="activeTab === 'url' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:bg-background/50'"
            @click="activeTab = 'url'"
          >
            <Link class="h-4 w-4" />
            链接
          </button>
          <button 
            class="px-3 py-2 text-sm font-medium rounded-md transition-all flex items-center justify-center gap-2"
            :class="activeTab === 'subscribe' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:bg-background/50'"
            @click="activeTab = 'subscribe'"
          >
            <Rss class="h-4 w-4" />
            订阅
          </button>
        </div>

        <!-- 文本/文件导入 -->
        <div v-if="activeTab === 'text'" class="flex-1 flex flex-col gap-3 min-h-0">
          <div class="relative flex-1">
            <textarea
              v-model="jsonText"
              class="w-full h-full p-3 rounded-lg border bg-transparent resize-none focus:outline-none focus:ring-2 focus:ring-ring text-xs font-mono"
              placeholder='粘贴书源JSON内容...

支持格式：
• 标准书源数组: [{bookSourceUrl: "...", ...}]
• 阅读合集: {bookSources: [...]}
• 订阅源: [{sourceUrl: "...", sourceName: "..."}]
• 单个书源对象'
              @input="onInputChange"
            ></textarea>
          </div>
          
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <label class="cursor-pointer">
                <input type="file" accept=".json,.txt" class="hidden" @change="onFileChange">
                <span class="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-secondary hover:bg-secondary/80 transition-colors font-medium">
                  <Upload class="h-3.5 w-3.5" />
                  选择文件
                </span>
              </label>
            </div>
          </div>
        </div>

        <!-- URL 导入 -->
        <div v-else-if="activeTab === 'url'" class="flex-1 flex flex-col gap-4">
          <div class="space-y-2">
            <label class="text-sm font-medium">书源链接</label>
            <Input 
              v-model="urlText" 
              placeholder="https://example.com/sources.json" 
            />
          </div>
          <div class="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-sm text-blue-700 dark:text-blue-300 flex gap-3">
            <AlertCircle class="h-5 w-5 shrink-0 mt-0.5" />
            <div class="space-y-2">
              <p class="font-medium">💡 远程书源导入</p>
              <p class="opacity-90 text-xs leading-relaxed">
                输入书源订阅链接后点击确认导入，系统会通过服务器获取并解析书源。
              </p>
              <p class="opacity-90 text-xs leading-relaxed">
                支持标准书源数组、阅读合集包装等多种 JSON 格式。
              </p>
            </div>
          </div>
        </div>

        <!-- 订阅管理 -->
        <div v-else-if="activeTab === 'subscribe'" class="flex-1 overflow-y-auto">
          <SourceSubscription @synced="emit('success')" />
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

      <SheetFooter v-if="activeTab !== 'subscribe'" class="mt-4">
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
