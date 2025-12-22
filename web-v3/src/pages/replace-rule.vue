<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { 
  ArrowLeft, Search, Plus, Trash2, Upload, Database, MoreHorizontal
} from 'lucide-vue-next'
import { replaceApi, type ReplaceRule } from '@/api/replace'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { SkeletonLoader } from '@/components/ui'
import { useMessage } from '@/composables/useMessage'
import EditRule from '@/components/replace/EditRule.vue'
import ImportRule from '@/components/replace/ImportRule.vue'

const router = useRouter()
const { success, error, warning } = useMessage()

const rules = ref<ReplaceRule[]>([])
const loading = ref(true)
const searchKeyword = ref('')
const showImport = ref(false)
const showEdit = ref(false)
const currentEditRule = ref<ReplaceRule | null>(null)
const selectedRules = ref<Set<string>>(new Set()) // Store Names as ID? Or use index?

// Original API doesn't guarantee ID? Assuming Name is key or we use object reference.
// Original delete uses list of objects.
// Let's use name as key for selection or just object.
// Using Set<ReplaceRule> is tricky in Vue ref.
// Let's use Set<string> of JSON.stringify(rule) or just index?
// API delete takes list of rules.
// Let's track selected objects.

const filteredRules = computed(() => {
  if (!searchKeyword.value) return rules.value
  const keyword = searchKeyword.value.toLowerCase()
  return rules.value.filter(s =>
    s.name.toLowerCase().includes(keyword) ||
    s.pattern.toLowerCase().includes(keyword) ||
    s.scope.toLowerCase().includes(keyword)
  )
})

async function loadRules() {
  loading.value = true
  try {
    const res = await replaceApi.getReplaceRules()
    if (res.isSuccess) {
      rules.value = res.data
    }
  } catch (e) {
    error('加载规则失败')
  } finally {
    loading.value = false
  }
}

async function toggleEnabled(rule: ReplaceRule) {
  // Optimistic update
  rule.isEnabled = !rule.isEnabled
  try {
    const res = await replaceApi.saveReplaceRule(rule)
    if (!res.isSuccess) {
      // Revert
      rule.isEnabled = !rule.isEnabled
      error('更新失败')
    }
  } catch (e) {
    rule.isEnabled = !rule.isEnabled
    error('更新出错')
  }
}

function openEdit(rule?: ReplaceRule) {
  currentEditRule.value = rule || null
  showEdit.value = true
}

// Batch delete
const isAllSelected = computed(() => {
  return filteredRules.value.length > 0 && selectedRules.value.size === filteredRules.value.length
})

function toggleSelectAll() {
  if (isAllSelected.value) {
    selectedRules.value.clear()
  } else {
    filteredRules.value.forEach(r => selectedRules.value.add(r.name)) // Assuming name is unique? Original code checked duplication.
  }
}

function toggleSelect(rule: ReplaceRule) {
  if (selectedRules.value.has(rule.name)) {
    selectedRules.value.delete(rule.name)
  } else {
    selectedRules.value.add(rule.name)
  }
}

async function startBatchDelete() {
  if (selectedRules.value.size === 0) return
  if (!confirm(`确定删除选中的 ${selectedRules.value.size} 条规则？`)) return
  
  const rulesToDelete = rules.value.filter(r => selectedRules.value.has(r.name))
  try {
    const res = await replaceApi.deleteReplaceRules(rulesToDelete)
    if (res.isSuccess) {
      success('删除成功')
      selectedRules.value.clear()
      loadRules()
    } else {
      error('删除失败')
    }
  } catch (e) {
    error('删除出错')
  }
}

function exportRules() {
  try {
    const data = JSON.stringify(rules.value, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `replacerules_${new Date().getTime()}.json`
    link.click()
    URL.revokeObjectURL(url)
    success(`已导出 ${rules.value.length} 条规则`)
  } catch (e) {
    error('导出失败')
  }
}

function goBack() {
  router.push('/')
}

onMounted(() => {
  loadRules()
})
</script>

<template>
  <div class="min-h-screen bg-background">
    <!-- Header -->
    <header class="sticky top-0 z-50 w-full bg-background/95 backdrop-blur border-b">
      <div class="container mx-auto flex h-14 max-w-screen-2xl items-center justify-between px-4">
        <div class="flex items-center gap-4">
          <Button variant="ghost" size="icon" @click="goBack">
            <ArrowLeft class="h-4 w-4" />
          </Button>
          <div>
            <h1 class="font-semibold">替换规则</h1>
            <p class="text-xs text-muted-foreground">{{ rules.length }} 条规则</p>
          </div>
        </div>
        
        <div class="flex items-center gap-2">
           <div class="relative hidden sm:block">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              v-model="searchKeyword"
              placeholder="搜索规则..."
              class="w-48 pl-9 h-8"
            />
          </div>

          <Button variant="ghost" size="icon" @click="exportRules" title="导出">
            <Database class="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" @click="showImport = true" title="导入">
            <Upload class="h-4 w-4" />
          </Button>
          <Button variant="default" size="sm" @click="openEdit()">
            <Plus class="h-4 w-4 mr-1" />
            新增
          </Button>
        </div>
      </div>
    </header>

    <!-- Main -->
    <main class="container mx-auto max-w-screen-2xl px-4 py-6">
      
      <!-- List Header / Batch Actions -->
      <div class="flex items-center justify-between mb-4 px-2">
        <div class="flex items-center gap-2">
          <input type="checkbox" :checked="isAllSelected" @change="toggleSelectAll" class="w-4 h-4 rounded border-gray-300">
          <span class="text-sm text-muted-foreground" v-if="selectedRules.size > 0">已选 {{ selectedRules.size }}</span>
          <Button 
            v-if="selectedRules.size > 0" 
            variant="ghost" 
            size="sm" 
            class="text-destructive h-8 px-2"
            @click="startBatchDelete"
          >
            <Trash2 class="h-3 w-3 mr-1" />
            删除
          </Button>
        </div>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="space-y-3">
        <SkeletonLoader v-for="i in 10" :key="i" type="text" :lines="1" />
      </div>

      <!-- List -->
      <div v-else-if="filteredRules.length > 0" class="rounded-lg border bg-card text-card-foreground shadow-sm">
        <div 
          v-for="(rule, index) in filteredRules" 
          :key="rule.name"
          class="flex items-center p-4 hover:bg-muted/50 transition-colors group"
          :class="{ 'border-t': index > 0 }"
        >
          <!-- Checkbox -->
          <div class="mr-4 flex items-center">
            <input 
              type="checkbox" 
              :checked="selectedRules.has(rule.name)" 
              @change="toggleSelect(rule)"
              class="w-4 h-4 rounded border-gray-300"
            >
          </div>

          <!-- Content -->
          <div class="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
            <!-- Name & Scope -->
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span class="font-medium truncate">{{ rule.name }}</span>
                <Badge variant="outline" class="text-[10px] h-4 px-1" v-if="rule.group">{{ rule.group }}</Badge>
              </div>
              <div class="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                <span class="bg-muted px-1 rounded">范围: {{ rule.scope || '全局' }}</span>
                <span v-if="rule.isRegex" class="text-blue-500">正则</span>
              </div>
            </div>

            <!-- Pattern -> Replacement -->
            <div class="min-w-0 sm:col-span-2 flex items-center gap-2 text-sm">
              <code class="bg-muted px-1.5 py-0.5 rounded text-xs truncate max-w-[40%]">{{ rule.pattern }}</code>
              <span class="text-muted-foreground">→</span>
              <code class="bg-muted px-1.5 py-0.5 rounded text-xs truncate max-w-[40%]">{{ rule.replacement || '删除' }}</code>
            </div>
          </div>

          <!-- Actions -->
          <div class="ml-4 flex items-center gap-2 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
            <div 
              class="cursor-pointer px-2 py-1 rounded hover:bg-muted text-xs font-medium"
              :class="rule.isEnabled ? 'text-green-600' : 'text-gray-400'"
              @click="toggleEnabled(rule)"
            >
              {{ rule.isEnabled ? '启用' : '禁用' }}
            </div>
            <Button variant="ghost" size="icon" class="h-8 w-8" @click="openEdit(rule)">
              <MoreHorizontal class="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <!-- Empty -->
      <div v-else class="flex flex-col items-center justify-center py-24">
        <div class="rounded-full bg-muted p-6 mb-6">
          <Database class="h-12 w-12 text-muted-foreground" />
        </div>
        <h2 class="text-lg font-semibold mb-2">暂无规则</h2>
        <Button @click="openEdit()">
          <Plus class="h-4 w-4 mr-2" />
          新增规则
        </Button>
      </div>
    </main>

    <!-- Modals -->
    <ImportRule v-model:open="showImport" @success="loadRules" />
    <EditRule v-model:open="showEdit" :rule="currentEditRule" @saved="loadRules" />
  </div>
</template>
