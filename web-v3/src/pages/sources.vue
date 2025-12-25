<script setup lang="ts">
/**
 * 书源管理页面 - 统一风格版
 * 特性：分组筛选、批量测速、响应式网格布局、与首页一致的布局风格
 */
import { ref, shallowRef, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
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
  <div class="min-h-screen bg-background selection:bg-primary/20">
    <!-- 顶部导航 - 统一 Neo-Modern 风格 -->
    <header class="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/40 transition-all duration-300">
      <div class="container mx-auto flex h-16 max-w-7xl items-center px-4 sm:px-6 gap-4">
        <!-- 左侧: 返回 + 标题 -->
        <div class="flex items-center gap-3 shrink-0">
          <button 
            class="w-10 h-10 rounded-full hover:bg-secondary/80 flex items-center justify-center transition-colors -ml-2"
            @click="router.push('/')"
          >
            <ArrowLeft class="h-5 w-5 text-muted-foreground" />
          </button>
          <div class="flex items-center gap-2.5">
            <h1 class="text-xl font-semibold tracking-tight">书源管理</h1>
            <Badge variant="secondary" class="rounded-full px-2.5 font-normal text-muted-foreground bg-secondary/50">
              {{ sources.length }}
            </Badge>
          </div>
        </div>
        
        <!-- 中间: 搜索框 (胶囊型) -->
        <div class="flex-1 flex justify-center max-w-xl mx-auto">
          <div class="relative w-full max-w-md group">
            <Search class="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <input
              v-model="searchKeyword"
              type="text"
              placeholder="搜索书源名称、URL或分组..."
              class="w-full h-11 pl-11 pr-4 rounded-full bg-secondary/50 border-0 text-sm
                     placeholder:text-muted-foreground/60
                     focus:outline-none focus:ring-2 focus:ring-primary/20 focus:bg-background
                     transition-all duration-300 shadow-sm"
            />
          </div>
        </div>

        <!-- 右侧: 操作按钮 -->
        <div class="flex items-center gap-2 shrink-0">
          <!-- 导入按钮 (PC显示文字，移动端只显示图标) -->
          <button 
            class="h-9 px-4 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium transition-all shadow-lg shadow-primary/20 flex items-center gap-2 active:scale-95"
            @click="showImport = true"
          >
            <Upload class="h-4 w-4" />
            <span class="hidden sm:inline">导入</span>
          </button>
          
          <!-- 更多菜单 -->
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <button class="w-10 h-10 rounded-full hover:bg-secondary/80 flex items-center justify-center transition-colors outline-none">
                <MoreHorizontal class="h-5 w-5 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-52 p-1.5 rounded-xl bg-background/80 backdrop-blur-xl border-border/50 shadow-xl">
              <DropdownMenuItem @click="loadSources" class="rounded-lg cursor-pointer">
                <RefreshCw class="h-4 w-4 mr-2" /> 刷新列表
              </DropdownMenuItem>
              <DropdownMenuItem @click="exportSources" class="rounded-lg cursor-pointer">
                <Download class="h-4 w-4 mr-2" /> 导出书源
              </DropdownMenuItem>
              <DropdownMenuSeparator class="my-1 bg-border/50" />
              <DropdownMenuItem @click="toggleManageMode" class="rounded-lg cursor-pointer">
                <CheckSquare class="h-4 w-4 mr-2" /> {{ isManageMode ? '退出管理' : '批量管理' }}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>

    <!-- 主内容区 -->
    <main class="container mx-auto max-w-7xl px-4 sm:px-6 py-6 pb-32">
      <!-- 顶部工具栏: 分组筛选 + 测速 -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <!-- 分组滚动列表 -->
        <div class="flex-1 overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
          <div class="flex items-center gap-2 pb-2 sm:pb-0">
            <button
              v-for="[group, count] in groups"
              :key="group"
              class="relative px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 whitespace-nowrap snap-start select-none group/btn"
              :class="activeGroup === group 
                ? 'bg-primary text-primary-foreground shadow-md shadow-primary/25' 
                : 'bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground'"
              @click="activeGroup = group"
            >
              {{ group }}
              <span class="ml-1 opacity-60 text-xs">{{ count }}</span>
              
              <!-- 删除分组按钮 (仅在Hover且非全部/未分组时显示) -->
              <div
                v-if="group !== '全部' && group !== '未分组' && activeGroup === group"
                class="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover/btn:opacity-100 transition-opacity scale-90 shadow-sm cursor-pointer"
                @click.stop="deleteGroupSources(group)"
              >
                <X class="h-2.5 w-2.5" />
              </div>
            </button>
          </div>
        </div>
        
        <!-- 测速开关 -->
        <div class="flex items-center gap-3 shrink-0 pl-1 self-end sm:self-auto">
          <div class="flex items-center gap-2 text-sm text-muted-foreground bg-secondary/30 px-3 py-1.5 rounded-full border border-border/50">
             <span class="w-1.5 h-1.5 rounded-full bg-green-500 shadow-sm shadow-green-500/50"></span>
             {{ stats.enabled }} 启用
          </div>
          <button 
            class="h-9 px-4 rounded-full text-sm font-medium transition-all flex items-center gap-2"
            :class="isBatchTesting 
              ? 'bg-destructive/10 text-destructive hover:bg-destructive/20'
              : 'bg-secondary hover:bg-secondary/80 text-foreground'"
            @click="isBatchTesting ? stopBatchTest() : batchTestSources()"
          >
            <component :is="isBatchTesting ? CheckSquare : Zap" class="h-4 w-4" />
            {{ isBatchTesting ? '停止测速' : '全量测速' }}
          </button>
        </div>
      </div>

      <!-- 列表标题 -->
      <div class="flex items-center justify-between mb-4 px-1">
        <h2 class="text-lg font-semibold flex items-center gap-2">
          <Database class="h-5 w-5 text-primary" />
          {{ activeGroup === '全部' ? '全部书源' : activeGroup }}
          <span class="text-sm font-normal text-muted-foreground ml-1">({{ stats.filtered }})</span>
        </h2>
        <div class="flex items-center gap-2 text-xs">
          <Badge variant="outline" class="border-green-500/30 text-green-600 bg-green-500/5 px-2">启用 {{ stats.enabled }}</Badge>
          <Badge variant="outline" class="border-orange-500/30 text-orange-600 bg-orange-500/5 px-2">禁用 {{ stats.total - stats.enabled }}</Badge>
        </div>
      </div>

      <!-- 加载状态 -->
      <div v-if="loading" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <div v-for="i in 12" :key="i" class="h-32 bg-card rounded-2xl border border-border/50 animate-pulse"></div>
      </div>

      <!-- 空状态 -->
      <div v-else-if="filteredSources.length === 0" class="flex flex-col items-center justify-center py-20 text-center animate-in fade-in zoom-in-95 duration-500">
        <div class="w-20 h-20 rounded-3xl bg-muted/50 flex items-center justify-center mb-6 shadow-inner">
          <Database class="h-10 w-10 text-muted-foreground/50" />
        </div>
        <h3 class="text-xl font-semibold mb-2">暂无书源</h3>
        <p class="text-muted-foreground text-sm mb-6 max-w-xs mx-auto leading-relaxed">该分组下没有书源，请尝试切换分组或导入新书源。</p>
        <Button size="lg" rounded="full" class="shadow-lg shadow-primary/20" @click="showImport = true">
          <Upload class="h-4 w-4 mr-2" /> 导入书源
        </Button>
      </div>

      <!-- 书源列表 (网格布局) -->
      <div 
        v-else 
        class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500"
      >
        <div
          v-for="source in filteredSources"
          :key="source.bookSourceUrl"
          class="group relative bg-card hover:bg-muted/30 rounded-2xl border border-border/50 transition-all duration-300 hover:shadow-lg hover:shadow-black/5 hover:-translate-y-1 overflow-hidden"
          :class="{ 
            'ring-2 ring-primary ring-offset-2 ring-offset-background': selectedUrls.has(source.bookSourceUrl),
            'opacity-60 grayscale-[0.5]': source.enabled === false && !isManageMode
          }"
          @click="isManageMode ? toggleSelect(source) : openEdit(source)"
        >
          <div class="p-4 h-full flex flex-col justify-between gap-3">
             <!-- 顶部: 图标 + 标题 + 状态 -->
             <div class="flex items-start justify-between gap-3">
               <div class="flex items-center gap-3 min-w-0 flex-1">
                 <!-- 图标 / 勾选框 -->
                 <div class="shrink-0 relative">
                   <transition name="scale" mode="out-in">
                     <div v-if="isManageMode" class="w-10 h-10 rounded-xl bg-secondary/50 flex items-center justify-center">
                       <Checkbox 
                         :checked="selectedUrls.has(source.bookSourceUrl)" 
                         @update:checked="toggleSelect(source)"
                         @click.stop
                         class="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                       />
                     </div>
                     <div v-else class="w-10 h-10 rounded-xl flex items-center justify-center transition-colors"
                          :class="source.enabled !== false ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'">
                        <Globe class="h-5 w-5" />
                     </div>
                   </transition>
                   
                   <!-- 状态点 (启用/禁用) -->
                   <div 
                     v-if="!isManageMode"
                     class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card"
                     :class="source.enabled !== false ? 'bg-green-500' : 'bg-orange-500'"
                   ></div>
                 </div>

                 <!-- 标题 & URL -->
                 <div class="flex-1 min-w-0">
                   <div class="flex items-center gap-2">
                     <h3 class="font-semibold text-sm truncate text-foreground">{{ source.bookSourceName }}</h3>
                   </div>
                   <p class="text-[10px] text-muted-foreground truncate font-mono mt-0.5 opacity-70">
                     {{ source.bookSourceUrl.replace(/https?:\/\//, '') }}
                   </p>
                 </div>
               </div>
               
               <!-- 更多操作 (悬浮显示) -->
               <div class="flex items-center -mr-2 -mt-2 opacity-0 group-hover:opacity-100 transition-opacity" v-if="!isManageMode">
                 <DropdownMenu>
                   <DropdownMenuTrigger as-child>
                     <button class="w-8 h-8 rounded-full hover:bg-secondary flex items-center justify-center text-muted-foreground" @click.stop>
                       <MoreHorizontal class="h-4 w-4" />
                     </button>
                   </DropdownMenuTrigger>
                   <DropdownMenuContent align="end" class="w-40 rounded-xl">
                     <DropdownMenuItem @click.stop="openEdit(source)">
                        <Edit2 class="h-3.5 w-3.5 mr-2" /> 编辑
                     </DropdownMenuItem>
                     <DropdownMenuItem @click.stop="testSource(source)">
                        <Zap class="h-3.5 w-3.5 mr-2" /> 测速
                     </DropdownMenuItem>
                     <DropdownMenuSeparator />
                     <DropdownMenuItem @click.stop="deleteSource(source)" class="text-destructive focus:text-destructive">
                        <Trash2 class="h-3.5 w-3.5 mr-2" /> 删除
                     </DropdownMenuItem>
                   </DropdownMenuContent>
                 </DropdownMenu>
               </div>
             </div>

             <!-- 底部: 分组 + 测速/开关 -->
             <div class="flex items-center justify-between pt-2 border-t border-border/30">
               <div class="flex items-center gap-2 overflow-hidden">
                 <Badge v-if="source.bookSourceGroup" variant="secondary" class="rounded-md px-1.5 py-0 text-[10px] bg-secondary/50 text-muted-foreground font-normal truncate max-w-[80px]">
                   {{ source.bookSourceGroup }}
                 </Badge>
               </div>

               <div class="flex items-center gap-3 shrink-0">
                 <!-- 测速结果 -->
                 <div v-if="source._bgTest" class="flex items-center gap-1.5">
                   <RefreshCw class="h-3 w-3 animate-spin text-primary" />
                   <span class="text-[10px] text-muted-foreground">测速中</span>
                 </div>
                 <div v-else-if="source._ping !== undefined" class="flex items-center gap-1.5" :class="getPingColor(source._ping)">
                   <div class="w-1.5 h-1.5 rounded-full bg-current"></div>
                   <span class="text-[10px] font-medium">{{ source._ping > 0 ? `${source._ping}ms` : '超时' }}</span>
                 </div>
                 
                 <!-- 快速开关 -->
                 <Switch 
                   v-if="!isManageMode"
                   :checked="source.enabled !== false" 
                   @update:checked="toggleEnable(source)"
                   @click.stop
                   class="scale-75 origin-right data-[state=checked]:bg-primary"
                 />
               </div>
             </div>
          </div>
        </div>
      </div>
    </main>

    <!-- 底部灵动岛操作栏 (管理模式) -->
    <Transition
      enter-active-class="transition duration-300 cubic-bezier(0.34, 1.56, 0.64, 1)"
      enter-from-class="translate-y-20 opacity-0 scale-90"
      enter-to-class="translate-y-0 opacity-100 scale-100"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="translate-y-0 opacity-100 scale-100"
      leave-to-class="translate-y-20 opacity-0 scale-90"
    >
      <div 
        v-if="isManageMode" 
        class="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 w-auto"
      >
        <div class="bg-black/80 dark:bg-white/10 backdrop-blur-2xl border border-white/10 shadow-2xl rounded-full px-2 py-2 flex items-center gap-1 text-white dark:text-foreground">
          
          <button class="h-10 px-4 rounded-full hover:bg-white/10 flex items-center gap-2 transition-colors active:scale-95" @click="selectAll">
            <component :is="selectedUrls.size === filteredSources.length ? CheckSquare : CheckSquare" class="h-5 w-5 opacity-70" />
            <span class="text-sm font-medium">{{ selectedUrls.size === filteredSources.length ? '取消' : '全选' }}</span>
          </button>
          
          <div class="w-px h-5 bg-white/20 mx-1"></div>
          
          <span class="text-xs font-medium px-2 opacity-60 tabular-nums">已选 {{ selectedUrls.size }}</span>

          <div class="w-px h-5 bg-white/20 mx-1"></div>
          
          <!-- 分组 -->
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
               <button class="w-10 h-10 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors active:scale-95" title="修改分组" :disabled="selectedUrls.size === 0">
                 <FolderX class="h-5 w-5" />
               </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" side="top" class="w-56 p-2 rounded-xl mb-3 bg-popover/90 backdrop-blur-xl border-border/50">
               <DropdownMenuItem @click="batchSetGroup('')" class="rounded-lg">设为未分组</DropdownMenuItem>
               <DropdownMenuSeparator class="my-1" v-if="existingGroups.length > 0" />
               <div class="max-h-48 overflow-y-auto px-1">
                 <DropdownMenuItem v-for="g in existingGroups" :key="g" @click="batchSetGroup(g)" class="rounded-lg">
                   {{ g }}
                 </DropdownMenuItem>
               </div>
               <DropdownMenuSeparator class="my-1" />
               <div class="p-1">
                 <div v-if="!showGroupInput" @click.stop="showGroupInput = true" class="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted cursor-pointer text-sm">
                    <Plus class="h-4 w-4" /> 新建分组...
                 </div>
                 <div v-else class="space-y-2">
                   <Input v-model="newGroupName" placeholder="分组名称" class="h-8 text-xs" />
                   <div class="flex gap-2">
                     <Button size="xs" class="flex-1" @click="confirmNewGroup">确定</Button>
                     <Button size="xs" variant="ghost" @click="showGroupInput = false">取消</Button>
                   </div>
                 </div>
               </div>
            </DropdownMenuContent>
          </DropdownMenu>

          <!-- 删除 -->
          <button 
             class="w-10 h-10 rounded-full hover:bg-red-500/20 text-red-400 hover:text-red-300 flex items-center justify-center transition-colors active:scale-95" 
             title="删除"
             :disabled="selectedUrls.size === 0"
             @click="batchDelete"
          >
            <Trash2 class="h-5 w-5" />
          </button>
          
          <!-- 关闭 -->
          <button 
             class="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors ml-2 active:scale-95" 
             @click="toggleManageMode"
          >
            <X class="h-5 w-5" />
          </button>
        </div>
      </div>
    </Transition>

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
