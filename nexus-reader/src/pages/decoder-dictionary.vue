<script setup lang="ts">
/**
 * 词典管理页面
 * 查看、编辑、导入导出解密词典
 */
import { ref, computed, onMounted, useTemplateRef } from 'vue'
import { useRouter } from 'vue-router'
import {
  Plus,
  Trash2,
  Upload,
  Download,
  BookOpen,
  Edit2,
  User,
  Building2,
  MapPin,
  Calendar,
  Users,
  Filter,
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { useMessage } from '@/composables/useMessage'
import { useConfirm } from '@/composables/useConfirm'
import { useErrorHandler } from '@/composables/useErrorHandler'
import { useDecoder } from '@/composables/useDecoder'
import {
  PageHeader,
  PageToolbar,
  ManageModeBar,
  EmptyState,
  LoadingGrid,
} from '@/components/common'
import type { BookType, DictionaryEntry, EntityCategory, DictionaryLevel } from '@/types/decoder'

type DecoderTransferEntry = {
  id?: string
  original: string
  real: string
  category: EntityCategory
  aliases?: string[]
  description?: string
  level?: DictionaryLevel
  bookId?: string
  bookType?: BookType
  categoryTags?: BookType[]
  confidence?: number
  confirmCount?: number
  source?: DictionaryEntry['source']
  createdAt?: number
  updatedAt?: number
}

const router = useRouter()
const { success, error: showError } = useMessage()
const { confirm } = useConfirm()
const { handlePromiseError } = useErrorHandler()
const decoder = useDecoder()

// 状态
const entries = ref<DictionaryEntry[]>([])
const loading = ref(true)
const searchKeyword = ref('')
const selectedEntries = ref<Set<string>>(new Set())
const isManageMode = ref(false)
const filterCategory = ref<EntityCategory | 'all'>('all')
const filterLevel = ref<DictionaryLevel | 'all'>('all')
const importInputRef = useTemplateRef<HTMLInputElement>('importInput')

// 编辑状态
const showEdit = ref(false)
const currentEditEntry = ref<Partial<DictionaryEntry> | null>(null)
const editForm = ref({
  original: '',
  real: '',
  category: 'person' as EntityCategory,
  description: '',
  aliases: '',
})

function normalizeText(value: string): string {
  return value.trim()
}

function isEntityCategory(value: unknown): value is EntityCategory {
  return (
    value === 'person' ||
    value === 'company' ||
    value === 'place' ||
    value === 'event' ||
    value === 'organization'
  )
}

function isDictionaryLevel(value: unknown): value is DictionaryLevel {
  return value === 'global' || value === 'category' || value === 'book'
}

function isBookType(value: unknown): value is BookType {
  return (
    value === 'era' ||
    value === 'entertainment' ||
    value === 'urban' ||
    value === 'history' ||
    value === 'business'
  )
}

function isEntrySource(value: unknown): value is DictionaryEntry['source'] {
  return value === 'system' || value === 'user' || value === 'ai' || value === 'community'
}

function getEntryBookType(entry?: Partial<DictionaryEntry> | null): BookType | undefined {
  const tag = entry?.categoryTags?.[0]
  if (isBookType(tag)) {
    return tag
  }
  return undefined
}

function getEntryScopeLabel(entry?: Partial<DictionaryEntry> | null): string {
  if (!entry?.level) return '公共词典'

  if (entry.level === 'book') {
    return entry.bookId ? `书籍词典 · ${entry.bookId}` : '书籍词典'
  }

  if (entry.level === 'category') {
    return getEntryBookType(entry) ? `分类词典 · ${getEntryBookType(entry)}` : '分类词典'
  }

  return '公共词典'
}

function toTransferEntry(entry: DictionaryEntry): DecoderTransferEntry {
  return {
    original: entry.original,
    real: entry.real,
    category: entry.category,
    aliases: entry.aliases?.length ? entry.aliases : undefined,
    description: entry.description || undefined,
    level: entry.level,
    bookId: entry.bookId,
    bookType: getEntryBookType(entry),
  }
}

function parseAliases(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const aliases = value
      .map(item => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean)
    return aliases.length > 0 ? aliases : undefined
  }

  if (typeof value === 'string') {
    const aliases = value
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)
    return aliases.length > 0 ? aliases : undefined
  }

  return undefined
}

function normalizeImportEntry(
  input: unknown,
  now: number
): { entry: DictionaryEntry | null; error?: string } {
  if (!input || typeof input !== 'object') {
    return { entry: null, error: '词条必须是对象' }
  }

  const raw = input as Partial<DecoderTransferEntry>
  const original = typeof raw.original === 'string' ? raw.original.trim() : ''
  const real = typeof raw.real === 'string' ? raw.real.trim() : ''

  if (!original || !real) {
    return { entry: null, error: '缺少 original 或 real' }
  }

  if (!isEntityCategory(raw.category)) {
    return { entry: null, error: 'category 不合法' }
  }

  const level = isDictionaryLevel(raw.level) ? raw.level : 'global'
  const bookId = typeof raw.bookId === 'string' && raw.bookId.trim() ? raw.bookId.trim() : undefined
  const bookType = isBookType(raw.bookType)
    ? raw.bookType
    : raw.categoryTags?.find(tag => isBookType(tag))

  if (level === 'book' && !bookId) {
    return { entry: null, error: 'book 级词条缺少 bookId' }
  }

  if (level === 'category' && !bookType) {
    return { entry: null, error: 'category 级词条缺少 bookType' }
  }

  const entry: DictionaryEntry = {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : crypto.randomUUID(),
    original,
    real,
    category: raw.category,
    aliases: parseAliases(raw.aliases),
    description: typeof raw.description === 'string' ? raw.description.trim() || undefined : undefined,
    level,
    categoryTags: level === 'category' && bookType ? [bookType] : undefined,
    bookId: level === 'book' ? bookId : undefined,
    confidence: typeof raw.confidence === 'number' ? raw.confidence : 100,
    confirmCount: typeof raw.confirmCount === 'number' ? raw.confirmCount : 0,
    source: isEntrySource(raw.source) ? raw.source : 'user',
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : now,
    updatedAt: now,
  }

  return { entry }
}

// 过滤后的词条
const filteredEntries = computed(() => {
  let result = entries.value

  // 关键词过滤
  if (searchKeyword.value) {
    const keyword = searchKeyword.value.toLowerCase()
    result = result.filter(
      (e) =>
        e.original.toLowerCase().includes(keyword) ||
        e.real.toLowerCase().includes(keyword) ||
        (e.description || '').toLowerCase().includes(keyword)
    )
  }

  // 类别过滤
  if (filterCategory.value !== 'all') {
    result = result.filter((e) => e.category === filterCategory.value)
  }

  // 层级过滤
  if (filterLevel.value !== 'all') {
    result = result.filter((e) => e.level === filterLevel.value)
  }

  return result
})

// 统计信息
const stats = computed(() => ({
  total: entries.value.length,
  filtered: filteredEntries.value.length,
  selected: selectedEntries.value.size,
  byCategory: {
    person: entries.value.filter((e) => e.category === 'person').length,
    company: entries.value.filter((e) => e.category === 'company').length,
    place: entries.value.filter((e) => e.category === 'place').length,
    event: entries.value.filter((e) => e.category === 'event').length,
    organization: entries.value.filter((e) => e.category === 'organization').length,
  },
}))

// 类别图标
function getCategoryIcon(category: EntityCategory) {
  const icons = {
    person: User,
    company: Building2,
    place: MapPin,
    event: Calendar,
    organization: Users,
  }
  return icons[category] || User
}

// 类别名称
function getCategoryName(category: EntityCategory): string {
  const names: Record<EntityCategory, string> = {
    person: '人物',
    company: '公司',
    place: '地点',
    event: '事件',
    organization: '组织',
  }
  return names[category] || '未知'
}

// 层级名称
function getLevelName(level: DictionaryLevel): string {
  const names: Record<DictionaryLevel, string> = {
    global: '公共',
    category: '分类',
    book: '书籍',
  }
  return names[level] || level
}

// 层级颜色
function getLevelColor(level: DictionaryLevel): string {
  const colors: Record<DictionaryLevel, string> = {
    global: 'bg-blue-500/10 text-blue-600',
    category: 'bg-purple-500/10 text-purple-600',
    book: 'bg-green-500/10 text-green-600',
  }
  return colors[level] || 'bg-muted text-muted-foreground'
}

// 加载词典
async function loadEntries() {
  loading.value = true
  selectedEntries.value.clear()
  try {
    const result = await decoder.loadDictionary({ level: 'all' })
    entries.value = result
  } catch (e) {
    handlePromiseError(e, '加载词典失败')
  } finally {
    loading.value = false
  }
}

// 打开编辑
function openEdit(entry?: DictionaryEntry) {
  if (entry) {
    currentEditEntry.value = entry
    editForm.value = {
      original: entry.original,
      real: entry.real,
      category: entry.category,
      description: entry.description || '',
      aliases: entry.aliases?.join(', ') || '',
    }
  } else {
    currentEditEntry.value = null
    editForm.value = {
      original: '',
      real: '',
      category: 'person',
      description: '',
      aliases: '',
    }
  }
  showEdit.value = true
}

// 保存词条
async function saveEntry() {
  const original = normalizeText(editForm.value.original)
  const real = normalizeText(editForm.value.real)

  if (!original || !real) {
    showError('请填写加密词和真实指代')
    return
  }

  try {
    const targetLevel = currentEditEntry.value?.level || 'global'
    const targetBookId = targetLevel === 'book' ? currentEditEntry.value?.bookId : undefined
    const entry: Partial<DictionaryEntry> = {
      ...currentEditEntry.value,
      original,
      real,
      category: editForm.value.category,
      description: normalizeText(editForm.value.description) || undefined,
      aliases: editForm.value.aliases
        ? editForm.value.aliases.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined,
    }

    const result = await decoder.addEntry(entry, targetLevel, targetBookId)
    if (result) {
      success(currentEditEntry.value ? '保存成功' : '已保存到公共词典')
      showEdit.value = false
      await loadEntries()
    } else {
      showError('保存失败')
    }
  } catch (e) {
    handlePromiseError(e, '保存失败')
  }
}

// 删除词条
async function deleteEntry(entry: DictionaryEntry) {
  const result = await confirm({
    title: '确认删除',
    description: `确定删除「${entry.original}」→「${entry.real}」？此操作不可恢复。`,
    variant: 'destructive',
  })
  if (!result) return

  try {
    loading.value = true
    const response = await decoder.deleteDictionaryEntry(entry.id, {
      level: entry.level,
      bookId: entry.bookId,
      category: getEntryBookType(entry),
    })
    if (!response.success) {
      showError('删除失败')
      return
    }
    entries.value = entries.value.filter((e) => e.id !== entry.id)
    selectedEntries.value.delete(entry.id)
    success('删除成功')
  } catch (e) {
    handlePromiseError(e, '删除词条失败')
  } finally {
    loading.value = false
  }
}

// 切换管理模式
function toggleManageMode() {
  isManageMode.value = !isManageMode.value
  if (!isManageMode.value) selectedEntries.value.clear()
}

// 全选
function selectAll() {
  if (selectedEntries.value.size === filteredEntries.value.length) {
    selectedEntries.value.clear()
  } else {
    selectedEntries.value = new Set(filteredEntries.value.map((e) => e.id))
  }
}

// 切换选择
function toggleSelect(entry: DictionaryEntry) {
  if (selectedEntries.value.has(entry.id)) {
    selectedEntries.value.delete(entry.id)
  } else {
    selectedEntries.value.add(entry.id)
  }
}

// 批量删除
async function batchDelete() {
  if (selectedEntries.value.size === 0) return
  const result = await confirm({
    title: '确认删除',
    description: `确定删除选中的 ${selectedEntries.value.size} 条词条吗？此操作不可恢复。`,
    variant: 'destructive',
  })
  if (!result) return

  try {
    loading.value = true
    const groupedRequests = new Map<
      string,
      { ids: string[]; level?: DictionaryLevel; bookId?: string; category?: BookType }
    >()

    entries.value
      .filter((entry) => selectedEntries.value.has(entry.id))
      .forEach((entry) => {
        const category = getEntryBookType(entry)
        const key = [entry.level, entry.bookId || '', category || ''].join('::')
        const existing = groupedRequests.get(key)

        if (existing) {
          existing.ids.push(entry.id)
          return
        }

        groupedRequests.set(key, {
          ids: [entry.id],
          level: entry.level,
          bookId: entry.bookId,
          category,
        })
      })

    let deleted = 0
    let failed = 0
    const deletedIds: string[] = []

    for (const request of groupedRequests.values()) {
      const response = await decoder.batchDeleteDictionaryEntries(request)
      deleted += response.deleted
      failed += response.failed
      deletedIds.push(...response.details.deletedIds)
    }

    entries.value = entries.value.filter((e) => !deletedIds.includes(e.id))
    selectedEntries.value.clear()
    isManageMode.value = false

    if (failed > 0) {
      success(`删除成功 ${deleted} 条，失败 ${failed} 条`)
    } else {
      success(`成功删除 ${deleted} 条词条`)
    }
  } catch (e) {
    handlePromiseError(e, '批量删除失败')
  } finally {
    loading.value = false
  }
}

// 导出词典
async function exportEntries() {
  try {
    const target =
      selectedEntries.value.size > 0
        ? entries.value.filter((e) => selectedEntries.value.has(e.id))
        : await decoder.exportEntries()

    const data = JSON.stringify(target.map(toTransferEntry), null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `decoder-dictionary_${Date.now()}.json`
    link.click()
    URL.revokeObjectURL(url)
    success(`已导出 ${target.length} 条词条`)
  } catch (e) {
    handlePromiseError(e, '导出失败')
  }
}

// 导入词典
async function importEntries(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  try {
    const text = await file.text()
    const data = JSON.parse(text) as unknown

    if (!Array.isArray(data)) {
      showError('无效的词典格式')
      return
    }

    const now = Date.now()
    const normalizedEntries: DictionaryEntry[] = []
    let invalidCount = 0

    for (const item of data) {
      const { entry } = normalizeImportEntry(item, now)
      if (entry) {
        normalizedEntries.push(entry)
      } else {
        invalidCount += 1
      }
    }

    if (normalizedEntries.length === 0) {
      showError('未找到可导入的有效词条')
      return
    }

    const result = await decoder.importEntries(normalizedEntries)
    if (result.success) {
      if (invalidCount > 0) {
        success(`成功导入 ${result.imported} 条词条，跳过 ${invalidCount} 条无效数据`)
      } else {
        success(`成功导入 ${result.imported} 条词条`)
      }
      await loadEntries()
    } else {
      showError('导入失败')
    }
  } catch (e) {
    handlePromiseError(e, '导入失败')
  } finally {
    input.value = ''
  }
}

function triggerImport() {
  importInputRef.value?.click()
}

// 返回
function goBack() {
  router.push('/')
}

onMounted(() => {
  loadEntries()
})
</script>

<template>
  <div class="min-h-screen bg-background selection:bg-primary/20">
    <div class="h-safe-top" />

    <!-- 主内容区 -->
    <main class="px-5 max-w-7xl mx-auto pt-6 sm:pt-8 pb-32">
      <!-- 页面头部 -->
      <PageHeader
        :search-value="searchKeyword"
        :search-placeholder="'搜索加密词或真实指代...'"
        :actions="[
          {
            label: '导出',
            icon: Download,
            onClick: exportEntries,
            variant: 'outline',
            hideLabelOnMobile: true,
          },
          {
            label: '导入',
            icon: Upload,
            onClick: triggerImport,
            variant: 'outline',
            hideLabelOnMobile: true,
          },
          {
            label: '新增词条',
            icon: Plus,
            onClick: () => openEdit(),
            variant: 'default',
          },
        ]"
        @update:search-value="searchKeyword = $event"
        @back="goBack"
      />

      <!-- 隐藏的导入输入框 -->
      <input
        ref="importInput"
        type="file"
        accept=".json"
        class="hidden"
        @change="importEntries"
      />

      <!-- 过滤器 -->
      <div class="flex items-center gap-3 mb-4 flex-wrap">
        <div class="flex items-center gap-2">
          <Filter class="w-4 h-4 text-muted-foreground" />
          <span class="text-sm text-muted-foreground">筛选:</span>
        </div>

        <!-- 类别过滤 -->
        <select
          v-model="filterCategory"
          class="px-3 py-1.5 text-sm bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="all">全部类别</option>
          <option value="person">人物</option>
          <option value="company">公司</option>
          <option value="place">地点</option>
          <option value="event">事件</option>
          <option value="organization">组织</option>
        </select>

        <!-- 层级过滤 -->
        <select
          v-model="filterLevel"
          class="px-3 py-1.5 text-sm bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="all">全部层级</option>
          <option value="global">公共词典</option>
          <option value="category">分类词典</option>
          <option value="book">书籍词典</option>
        </select>

        <span class="text-xs text-muted-foreground">
          导入导出使用精简 JSON：`original`、`real`、`category`，可选 `aliases`、`description`、`level`、`bookId`、`bookType`
        </span>
      </div>

      <!-- 页面工具栏 -->
      <PageToolbar
        title="解密词典"
        :icon="BookOpen"
        :count="stats.filtered"
        :stats="[
          { label: '人物', value: stats.byCategory.person, color: '#3b82f6' },
          { label: '公司', value: stats.byCategory.company, color: '#8b5cf6' },
          { label: '地点', value: stats.byCategory.place, color: '#22c55e' },
        ]"
        :is-manage-mode="isManageMode"
        @toggle-manage="toggleManageMode"
      />

      <!-- 加载状态 -->
      <LoadingGrid v-if="loading" />

      <!-- 空状态 -->
      <EmptyState
        v-else-if="filteredEntries.length === 0"
        :icon="BookOpen"
        :title="searchKeyword ? '未找到匹配的词条' : '暂无词条'"
        :description="searchKeyword ? '尝试更换搜索关键词' : '添加词条来帮助解密加密内容'"
        :actions="[
          {
            label: '新增词条',
            icon: Plus,
            onClick: () => openEdit(),
          },
          ...(searchKeyword
            ? [
                {
                  label: '查看全部',
                  onClick: () => (searchKeyword = ''),
                  variant: 'outline' as const,
                },
              ]
            : []),
        ]"
      />

      <!-- 词条列表 -->
      <div
        v-else
        class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500"
      >
        <div
          v-for="entry in filteredEntries"
          :key="entry.id"
          class="group relative bg-card hover:bg-muted/50 rounded-2xl border transition-all duration-200 cursor-pointer overflow-hidden"
          :class="{
            'ring-2 ring-primary ring-offset-2 ring-offset-background border-primary/50':
              selectedEntries.has(entry.id) && isManageMode,
            'border-border/50 hover:border-border hover:shadow-md':
              !selectedEntries.has(entry.id),
          }"
          @click="isManageMode ? toggleSelect(entry) : openEdit(entry)"
        >
          <div class="p-4 h-full flex flex-col gap-3">
            <!-- 顶部 -->
            <div class="flex items-start justify-between gap-3">
              <div class="flex items-start gap-3 min-w-0 flex-1">
                <!-- 勾选框 / 图标 -->
                <div class="shrink-0 relative mt-0.5">
                  <div
                    v-if="isManageMode"
                    class="w-5 h-5 flex items-center justify-center"
                    @click.stop="toggleSelect(entry)"
                  >
                    <Checkbox
                      :checked="selectedEntries.has(entry.id)"
                      @update:checked="toggleSelect(entry)"
                      @click.stop
                    />
                  </div>
                  <div
                    v-else
                    class="w-8 h-8 rounded-lg flex items-center justify-center bg-primary/10 text-primary"
                  >
                    <component :is="getCategoryIcon(entry.category)" class="h-4 w-4" />
                  </div>
                </div>

                <!-- 标题 -->
                <div class="flex-1 min-w-0">
                  <h3 class="font-semibold text-sm leading-tight mb-1 text-foreground">
                    {{ entry.original }}
                  </h3>
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <Badge
                      variant="secondary"
                      class="rounded-md px-2 py-0.5 text-xs"
                      :class="getLevelColor(entry.level)"
                    >
                      {{ getLevelName(entry.level) }}
                    </Badge>
                    <span class="text-xs text-muted-foreground">
                      {{ getEntryScopeLabel(entry) }}
                    </span>
                    <span class="text-xs text-muted-foreground">
                      {{ getCategoryName(entry.category) }}
                    </span>
                  </div>
                </div>
              </div>

              <!-- 操作按钮 -->
              <div
                v-if="!isManageMode"
                class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              >
                <button
                  class="w-7 h-7 rounded-md hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                  @click.stop="openEdit(entry)"
                  title="编辑"
                >
                  <Edit2 class="h-3.5 w-3.5" />
                </button>
                <button
                  class="w-7 h-7 rounded-md hover:bg-destructive/10 hover:text-destructive flex items-center justify-center text-muted-foreground transition-colors"
                  @click.stop="deleteEntry(entry)"
                  title="删除"
                >
                  <Trash2 class="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <!-- 中间: 映射关系 -->
            <div class="flex-1 pt-2 border-t border-border/40">
              <div class="flex items-center gap-2 text-sm">
                <span class="text-muted-foreground">{{ entry.original }}</span>
                <span class="text-muted-foreground/60">→</span>
                <span class="font-medium text-primary">{{ entry.real }}</span>
              </div>
              <p v-if="entry.description" class="text-xs text-muted-foreground mt-1 line-clamp-2">
                {{ entry.description }}
              </p>
            </div>

            <!-- 底部: 置信度 -->
            <div class="flex items-center justify-between pt-2 border-t border-border/40">
              <div class="text-xs text-muted-foreground">
                置信度: {{ entry.confidence }}%
              </div>
              <div class="text-xs text-muted-foreground">
                确认: {{ entry.confirmCount }} 次
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- 底部操作栏 (管理模式) -->
    <ManageModeBar
      v-if="isManageMode"
      :selected-count="selectedEntries.size"
      :total-count="filteredEntries.length"
      @select-all="selectAll"
      @delete="batchDelete"
      @close="toggleManageMode"
    />

    <!-- 编辑弹窗 -->
    <Teleport to="body">
      <div
        v-if="showEdit"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        @click.self="showEdit = false"
      >
        <div class="bg-background rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
          <h2 class="text-lg font-semibold mb-4">
            {{ currentEditEntry ? '编辑词条' : '新增词条' }}
          </h2>

          <div class="space-y-4">
            <div class="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              {{
                currentEditEntry
                  ? `当前作用域：${getEntryScopeLabel(currentEditEntry)}`
                  : '新建词条默认保存到公共词典；当前页面不提供书籍级或分类级新建入口。'
              }}
            </div>

            <!-- 加密词 -->
            <div>
              <label class="text-sm text-muted-foreground mb-1 block">加密词</label>
              <input
                v-model="editForm.original"
                type="text"
                class="w-full px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="如: 马芸"
              />
            </div>

            <!-- 真实指代 -->
            <div>
              <label class="text-sm text-muted-foreground mb-1 block">真实指代</label>
              <input
                v-model="editForm.real"
                type="text"
                class="w-full px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="如: 马云"
              />
            </div>

            <!-- 类别 -->
            <div>
              <label class="text-sm text-muted-foreground mb-1 block">类别</label>
              <select
                v-model="editForm.category"
                class="w-full px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="person">人物</option>
                <option value="company">公司</option>
                <option value="place">地点</option>
                <option value="event">事件</option>
                <option value="organization">组织</option>
              </select>
            </div>

            <!-- 描述 -->
            <div>
              <label class="text-sm text-muted-foreground mb-1 block">描述 (可选)</label>
              <input
                v-model="editForm.description"
                type="text"
                class="w-full px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="如: 阿里巴巴创始人"
              />
            </div>

            <!-- 别名 -->
            <div>
              <label class="text-sm text-muted-foreground mb-1 block">别名 (可选，逗号分隔)</label>
              <input
                v-model="editForm.aliases"
                type="text"
                class="w-full px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="如: 杰克马, 风清扬"
              />
            </div>
          </div>

          <!-- 按钮 -->
          <div class="flex gap-3 mt-6">
            <Button variant="outline" class="flex-1" @click="showEdit = false">
              取消
            </Button>
            <Button class="flex-1" @click="saveEntry">
              保存
            </Button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.h-safe-top {
  height: env(safe-area-inset-top, 0px);
}
</style>
