<script setup lang="ts">
/**
 * 书源管理页面 - 统一风格版
 * 特性：分组筛选、批量测速、响应式网格布局、与首页一致的布局风格
 */
import { ref, shallowRef, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useWindowSize } from '@vueuse/core'
import { 
  ArrowLeft, Search, RefreshCw, Database, 
  Trash2, Upload, Download, MoreHorizontal, 
  Zap, Globe, CheckSquare, X, Edit2, FolderX
} from 'lucide-vue-next'
import { $get, $post } from '@/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useMessage } from '@/composables/useMessage'
import ImportSource from '@/components/source/ImportSource.vue'
import EditSource from '@/components/source/EditSource.vue'

const router = useRouter()
const { success, error } = useMessage()
const { height: windowHeight } = useWindowSize()

// ====== 类型定义 ======
interface BookSource {
  bookSourceName: string
  bookSourceUrl: string
  bookSourceGroup?: string
  enabled?: boolean
  _ping?: number
  _bgTest?: boolean
}

// ====== 状态 ======
const sources = ref<BookSource[]>([])
const loading = ref(true)
const searchKeyword = ref('')
const activeGroup = ref('全部')
const showImport = ref(false)
const showEdit = ref(false)
const currentEditSource = ref<BookSource | null>(null)
const selectedUrls = shallowRef<Set<string>>(new Set())
const isManageMode = ref(false)
const isBatchTesting = ref(false)
const showGroupInput = ref(false)
const newGroupName = ref('')

// ====== 计算属性 ======
// 分组统计
const groups = computed(() => {
  const groupMap: Record<string, number> = { '全部': sources.value.length }
  sources.value.forEach(s => {
    const g = s.bookSourceGroup?.trim() || '未分组'
    groupMap[g] = (groupMap[g] || 0) + 1
  })
  // 排序：全部 -> 未分组 -> 其他按数量
  const entries = Object.entries(groupMap)
  return entries.sort((a, b) => {
    if (a[0] === '全部') return -1
    if (b[0] === '全部') return 1
    if (a[0] === '未分组') return -1
    if (b[0] === '未分组') return 1
    return b[1] - a[1]
  })
})

const filteredSources = computed(() => {
  let result = sources.value

  // 分组筛选
  if (activeGroup.value !== '全部') {
    if (activeGroup.value === '未分组') {
      result = result.filter(s => !s.bookSourceGroup?.trim())
    } else {
      result = result.filter(s => s.bookSourceGroup?.trim() === activeGroup.value)
    }
  }

  // 关键词筛选
  if (searchKeyword.value) {
    const k = searchKeyword.value.toLowerCase()
    result = result.filter(s => 
      s.bookSourceName.toLowerCase().includes(k) || 
      s.bookSourceUrl.toLowerCase().includes(k) ||
      (s.bookSourceGroup || '').toLowerCase().includes(k)
    )
  }

  return result
})

const stats = computed(() => ({
  total: sources.value.length,
  enabled: sources.value.filter(s => s.enabled !== false).length,
  filtered: filteredSources.value.length,
  selected: selectedUrls.value.size
}))

// ====== 方法 ======
async function loadSources() {
  loading.value = true
  selectedUrls.value.clear()
  try {
    const res = await $get<BookSource[]>('/getBookSources')
    if (res.isSuccess) {
      sources.value = res.data || []
    }
  } catch (e) {
    error('加载书源失败')
  } finally {
    loading.value = false
  }
}

async function testSource(source: BookSource) {
  source._bgTest = true
  try {
    const start = Date.now()
    const res = await $post('/testBookSource', { bookSourceUrl: source.bookSourceUrl })
    source._ping = res.isSuccess ? Date.now() - start : -1
  } catch {
    source._ping = -1
  } finally {
    source._bgTest = false
  }
}

async function batchTestSources() {
  const toTest = filteredSources.value.filter(s => s._ping === undefined)
  if (toTest.length === 0) {
    success('所有书源已测试完毕')
    return
  }
  
  isBatchTesting.value = true
  let tested = 0
  
  for (const source of toTest) {
    if (!isBatchTesting.value) break // 允许中途停止
    await testSource(source)
    tested++
  }
  
  isBatchTesting.value = false
  success(`已测试 ${tested} 个书源`)
}

function stopBatchTest() {
  isBatchTesting.value = false
}

async function toggleEnable(source: BookSource) {
  const oldVal = source.enabled
  source.enabled = !oldVal
  try {
    await $post('/saveBookSource', source)
  } catch {
    source.enabled = oldVal
    error('状态更新失败')
  }
}

async function deleteSource(source: BookSource) {
  if (!confirm(`确定删除「${source.bookSourceName}」？`)) return
  try {
    const res = await $post('/deleteBookSource', { bookSourceUrl: source.bookSourceUrl })
    if (res.isSuccess) {
      sources.value = sources.value.filter(s => s.bookSourceUrl !== source.bookSourceUrl)
      selectedUrls.value.delete(source.bookSourceUrl)
      success('删除成功')
    }
  } catch { error('删除失败') }
}

async function batchDelete() {
  if (selectedUrls.value.size === 0) return
  if (!confirm(`确定删除选中的 ${selectedUrls.value.size} 个书源吗？`)) return
  
  let successCount = 0
  for (const url of selectedUrls.value) {
    try {
      await $post('/deleteBookSource', { bookSourceUrl: url })
      successCount++
      sources.value = sources.value.filter(s => s.bookSourceUrl !== url)
    } catch (e) { console.error(e) }
  }
  selectedUrls.value = new Set()
  isManageMode.value = false
  success(`删除了 ${successCount} 个书源`)
}

function exportSources() {
  const target = selectedUrls.value.size > 0 
    ? sources.value.filter(s => selectedUrls.value.has(s.bookSourceUrl))
    : filteredSources.value
  const data = JSON.stringify(target, null, 2)
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `booksources_${Date.now()}.json`
  link.click()
  URL.revokeObjectURL(url)
  success(`已导出 ${target.length} 个书源`)
}

function toggleSelect(source: BookSource) {
  const newSet = new Set(selectedUrls.value)
  if (newSet.has(source.bookSourceUrl)) {
    newSet.delete(source.bookSourceUrl)
  } else {
    newSet.add(source.bookSourceUrl)
  }
  selectedUrls.value = newSet
}

function selectAll() {
  if (selectedUrls.value.size === filteredSources.value.length) {
    selectedUrls.value = new Set()
  } else {
    selectedUrls.value = new Set(filteredSources.value.map(s => s.bookSourceUrl))
  }
}

function openEdit(source: BookSource) {
  currentEditSource.value = source
  showEdit.value = true
}

function toggleManageMode() {
  isManageMode.value = !isManageMode.value
  if (!isManageMode.value) selectedUrls.value = new Set()
}

function getPingColor(ping: number) {
  if (ping < 0) return 'text-red-500 bg-red-500/10'
  if (ping < 300) return 'text-green-500 bg-green-500/10'
  if (ping < 800) return 'text-yellow-600 bg-yellow-500/10'
  return 'text-orange-500 bg-orange-500/10'
}

function getPingBg(ping: number) {
  if (ping < 0) return 'border-red-200 dark:border-red-800'
  if (ping < 300) return 'border-green-200 dark:border-green-800'
  if (ping < 800) return 'border-yellow-200 dark:border-yellow-800'
  return 'border-orange-200 dark:border-orange-800'
}

// 获取所有已用分组名（排除全部和未分组）
const existingGroups = computed(() => {
  return groups.value.filter(([name]) => name !== '全部' && name !== '未分组').map(([name]) => name)
})

// 批量修改选中书源的分组
async function batchSetGroup(groupName: string) {
  if (selectedUrls.value.size === 0) {
    error('请先选择书源')
    return
  }
  
  const urls = Array.from(selectedUrls.value)
  const toUpdate = sources.value.filter(s => urls.includes(s.bookSourceUrl))
  
  // 修改分组
  toUpdate.forEach(s => {
    s.bookSourceGroup = groupName === '' ? undefined : groupName
  })
  
  try {
    await $post('/saveBookSources', toUpdate)
    success(`已将 ${toUpdate.length} 个书源移至「${groupName || '未分组'}」`)
    selectedUrls.value = new Set()
    isManageMode.value = false
    showGroupInput.value = false
    newGroupName.value = ''
  } catch (e) {
    error('修改分组失败')
  }
}

// 设置新分组
function confirmNewGroup() {
  if (!newGroupName.value.trim()) {
    error('请输入分组名称')
    return
  }
  batchSetGroup(newGroupName.value.trim())
}

// 删除分组内所有书源
async function deleteGroupSources(groupName: string) {
  const toDelete = sources.value.filter(s => {
    if (groupName === '未分组') {
      return !s.bookSourceGroup?.trim()
    }
    return s.bookSourceGroup?.trim() === groupName
  })
  
  if (toDelete.length === 0) {
    error('该分组没有书源')
    return
  }
  
  if (!confirm(`确定删除「${groupName}」分组内的 ${toDelete.length} 个书源吗？`)) {
    return
  }
  
  try {
    await $post('/deleteBookSources', toDelete)
    sources.value = sources.value.filter(s => !toDelete.some(d => d.bookSourceUrl === s.bookSourceUrl))
    success(`已删除 ${toDelete.length} 个书源`)
    if (activeGroup.value === groupName) {
      activeGroup.value = '全部'
    }
  } catch (e) {
    error('删除失败')
  }
}

onMounted(() => loadSources())
</script>

<template>
  <div class="min-h-screen bg-background">
    <!-- 顶部导航 - 与首页风格一致 -->
    <header class="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b">
      <div class="container mx-auto flex h-14 max-w-screen-2xl items-center px-4 gap-4">
        <!-- 返回 + 标题 -->
        <div class="flex items-center gap-2 shrink-0">
          <button 
            class="w-9 h-9 rounded-full hover:bg-muted flex items-center justify-center transition-colors"
            @click="router.push('/')"
          >
            <ArrowLeft class="h-4 w-4" />
          </button>
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Database class="h-4 w-4 text-primary" />
            </div>
            <span class="font-semibold hidden sm:inline">书源管理</span>
          </div>
        </div>
        
        <!-- 搜索框 - 居中 -->
        <div class="flex-1 flex justify-center">
          <div class="w-full max-w-md">
            <div class="relative group">
              <Search class="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-foreground" />
              <input
                v-model="searchKeyword"
                type="text"
                placeholder="搜索书源..."
                class="w-full h-9 pl-10 pr-4 rounded-full bg-muted/50 border-0 text-sm
                       placeholder:text-muted-foreground/70
                       focus:outline-none focus:ring-2 focus:ring-primary/20 focus:bg-background
                       transition-all"
              />
            </div>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="flex items-center gap-1 shrink-0">
          <!-- 导入 -->
          <button 
            class="h-8 px-3 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-medium transition-colors flex items-center gap-1.5"
            @click="showImport = true"
          >
            <Upload class="h-3.5 w-3.5" />
            <span class="hidden sm:inline">导入</span>
          </button>
          
          <!-- 更多菜单 -->
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <button class="w-9 h-9 rounded-full hover:bg-muted flex items-center justify-center transition-colors">
                <MoreHorizontal class="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-48">
              <DropdownMenuItem @click="loadSources">
                <RefreshCw class="h-4 w-4 mr-2" /> 刷新列表
              </DropdownMenuItem>
              <DropdownMenuItem @click="exportSources">
                <Download class="h-4 w-4 mr-2" /> 导出书源
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem @click="toggleManageMode">
                <CheckSquare class="h-4 w-4 mr-2" /> {{ isManageMode ? '退出管理' : '批量管理' }}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>

    <!-- 主内容区 -->
    <main class="container mx-auto max-w-screen-2xl px-4 py-6">
      <!-- 分组标签 + 统计 -->
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
          <div
            v-for="[group, count] in groups"
            :key="group"
            class="shrink-0 flex items-center gap-1 group/tag"
          >
            <button
              class="px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
              :class="activeGroup === group 
                ? 'bg-primary text-primary-foreground' 
                : 'bg-muted text-muted-foreground hover:bg-muted/80'"
              @click="activeGroup = group"
            >
              {{ group }}
              <span class="ml-1 opacity-70">({{ count }})</span>
            </button>
            <!-- 删除分组按钮 -->
            <button
              v-if="group !== '全部' && activeGroup === group"
              class="w-5 h-5 rounded-full flex items-center justify-center text-destructive bg-destructive/10 hover:bg-destructive/20 transition-colors opacity-0 group-hover/tag:opacity-100"
              title="删除该分组内所有书源"
              @click.stop="deleteGroupSources(group)"
            >
              <FolderX class="h-3 w-3" />
            </button>
          </div>
        </div>
        
        <!-- 批量测速按钮 -->
        <div class="flex items-center gap-2 shrink-0">
          <button 
            v-if="!isBatchTesting"
            class="h-8 px-3 rounded-full border bg-background hover:bg-muted text-xs font-medium transition-colors flex items-center gap-1.5"
            @click="batchTestSources"
          >
            <Zap class="h-3.5 w-3.5" />
            测速
          </button>
          <button 
            v-else
            class="h-8 px-3 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 text-xs font-medium transition-colors flex items-center gap-1.5"
            @click="stopBatchTest"
          >
            <X class="h-3.5 w-3.5" />
            停止
          </button>
        </div>
      </div>

      <!-- 列表标题 -->
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold flex items-center gap-2">
          <Database class="h-5 w-5" />
          {{ activeGroup === '全部' ? '全部书源' : activeGroup }}
          <span class="text-sm font-normal text-muted-foreground">({{ stats.filtered }})</span>
        </h2>
        <div class="flex items-center gap-2">
          <Badge variant="outline" class="text-green-600">启用 {{ stats.enabled }}</Badge>
          <Badge variant="outline" class="text-orange-600">禁用 {{ stats.total - stats.enabled }}</Badge>
        </div>
      </div>

      <!-- 加载状态 -->
      <div v-if="loading" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div v-for="i in 9" :key="i" class="bg-card rounded-xl border p-4 animate-pulse">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-muted"></div>
            <div class="flex-1 space-y-2">
              <div class="h-4 bg-muted rounded w-1/2"></div>
              <div class="h-3 bg-muted rounded w-3/4"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-else-if="filteredSources.length === 0" class="py-16 text-center">
        <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
          <Database class="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 class="text-lg font-medium mb-2">暂无书源</h3>
        <p class="text-muted-foreground text-sm mb-4">导入书源开始使用</p>
        <Button @click="showImport = true">
          <Upload class="h-4 w-4 mr-2" /> 导入书源
        </Button>
      </div>

      <!-- 书源列表 (网格布局) -->
      <div 
        v-else 
        class="overflow-y-auto pb-6" 
        :style="{ maxHeight: `${windowHeight - 240}px` }"
      >
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
          <div
            v-for="source in filteredSources"
            :key="source.bookSourceUrl"
            class="p-3 rounded-xl bg-card hover:bg-muted/50 border transition-all duration-200 cursor-pointer group"
            :class="{ 
              'ring-2 ring-primary bg-primary/5': selectedUrls.has(source.bookSourceUrl),
              'opacity-50': source.enabled === false
            }"
            @click="isManageMode ? toggleSelect(source) : openEdit(source)"
          >
            <div class="flex items-center gap-3">
              <!-- 图标/选择框 -->
              <div class="shrink-0">
                <div v-if="isManageMode" class="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                  <Checkbox 
                    :checked="selectedUrls.has(source.bookSourceUrl)" 
                    @update:checked="toggleSelect(source)"
                    @click.stop
                    class="scale-90"
                  />
                </div>
                <div v-else class="w-8 h-8 rounded-full flex items-center justify-center"
                     :class="source.enabled !== false ? 'bg-primary/10' : 'bg-muted'">
                  <Globe :class="source.enabled !== false ? 'h-4 w-4 text-primary' : 'h-4 w-4 text-muted-foreground'" />
                </div>
              </div>

              <!-- 内容 -->
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <h3 class="font-medium text-sm truncate max-w-[120px]">{{ source.bookSourceName }}</h3>
                  <Badge v-if="source.bookSourceGroup" variant="secondary" class="shrink-0 text-[10px] h-4 px-1">
                    {{ source.bookSourceGroup }}
                  </Badge>
                  <Badge 
                    v-if="source._ping !== undefined" 
                    variant="outline"
                    class="shrink-0 text-[10px] h-4 px-1"
                    :class="getPingColor(source._ping)"
                  >
                    {{ source._ping > 0 ? `${source._ping}ms` : '超时' }}
                  </Badge>
                  <span v-if="source._bgTest" class="text-[10px] text-muted-foreground animate-pulse">测速中...</span>
                </div>
                <p class="text-[11px] text-muted-foreground truncate font-mono mt-0.5">
                  {{ source.bookSourceUrl }}
                </p>
              </div>

              <!-- 操作 -->
              <div v-if="!isManageMode" class="flex items-center gap-1.5 shrink-0">
                <button 
                  class="w-7 h-7 rounded-full hover:bg-muted flex items-center justify-center transition-colors"
                  :disabled="source._bgTest"
                  title="测速"
                  @click.stop="testSource(source)"
                >
                  <Zap v-if="!source._bgTest" class="h-3.5 w-3.5" />
                  <RefreshCw v-else class="h-3.5 w-3.5 animate-spin" />
                </button>
                <button 
                  class="w-7 h-7 rounded-full hover:bg-destructive/10 flex items-center justify-center transition-colors text-destructive opacity-0 group-hover:opacity-100"
                  title="删除"
                  @click.stop="deleteSource(source)"
                >
                  <Trash2 class="h-3.5 w-3.5" />
                </button>
                <Switch 
                  :checked="source.enabled !== false" 
                  @update:checked="toggleEnable(source)"
                  @click.stop
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- 底部操作栏 (管理模式) -->
    <div 
      v-if="isManageMode" 
      class="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
    >
      <div class="bg-popover border shadow-xl rounded-2xl px-4 py-2 flex items-center gap-3 animate-in slide-in-from-bottom-2">
        <Button variant="ghost" size="sm" @click="selectAll">
          {{ selectedUrls.size === filteredSources.length ? '取消全选' : '全选' }}
        </Button>
        <div class="h-4 w-px bg-border"></div>
        <span class="text-sm font-medium whitespace-nowrap">已选 {{ selectedUrls.size }} 项</span>
        <div class="h-4 w-px bg-border"></div>
        
        <!-- 修改分组下拉菜单 -->
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" :disabled="selectedUrls.size === 0">
              <Edit2 class="h-4 w-4 mr-1" />
              修改分组
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" class="w-48">
            <DropdownMenuItem @click="batchSetGroup('')">
              设为未分组
            </DropdownMenuItem>
            <DropdownMenuSeparator v-if="existingGroups.length > 0" />
            <DropdownMenuItem 
              v-for="g in existingGroups" 
              :key="g"
              @click="batchSetGroup(g)"
            >
              {{ g }}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <div v-if="!showGroupInput" class="px-2 py-1.5">
              <Button variant="outline" size="sm" class="w-full" @click.stop="showGroupInput = true">
                + 新建分组
              </Button>
            </div>
            <div v-else class="px-2 py-1.5 space-y-2">
              <Input 
                v-model="newGroupName" 
                placeholder="分组名称" 
                class="h-8 text-sm"
                @keyup.enter="confirmNewGroup"
              />
              <div class="flex gap-2">
                <Button size="sm" class="flex-1" @click="confirmNewGroup">确定</Button>
                <Button size="sm" variant="ghost" @click="showGroupInput = false; newGroupName = ''">取消</Button>
              </div>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
        
        <Button 
          variant="ghost" 
          size="sm" 
          class="text-destructive hover:bg-destructive/10"
          :disabled="selectedUrls.size === 0"
          @click="batchDelete"
        >
          <Trash2 class="h-4 w-4 mr-1" />
          删除
        </Button>
        <Button variant="ghost" size="icon" class="ml-1 -mr-1 text-muted-foreground" @click="toggleManageMode">
          <X class="h-4 w-4" />
        </Button>
      </div>
    </div>

    <ImportSource v-model:open="showImport" @success="loadSources" />
    <EditSource v-model:open="showEdit" :source="currentEditSource" @saved="loadSources" />
  </div>
</template>

<style scoped>
.scrollbar-hide {
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
</style>
