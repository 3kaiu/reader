<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { 
  ArrowLeft, Plus, Trash2, Edit2, Check, X, ArrowUp, ArrowDown
} from 'lucide-vue-next'
import { groupApi, type BookGroup } from '@/api/group'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SkeletonLoader } from '@/components/ui'
import { useMessage } from '@/composables/useMessage'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog' // Assuming these exist or will be shimmed if not? 
// Actually I don't have Dialog components yet (list_dir previously confirmed).
// I will use `Sheet` or simple prompt/confirm logic.
// For "Edit", a prompt is enough.
// I'll implementation a simple inline edit or reusing Sheet from ReplaceRule but modified?
// Inline edit is easiest for simple name change.
// Or I can use prompt() browser API? No, "Rich Aesthetics".
// I'll use a simple "Edit Modal" using Sheet (bottom).

// Wait, I used Sheet for Import/Edit rules. I can reuse Sheet logic.
// Let's use `Sheet` for adding/editing group.

import { 
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter
} from '@/components/ui/sheet'

const router = useRouter()
const { success, error } = useMessage()

const groups = ref<BookGroup[]>([])
const loading = ref(true)

const showEdit = ref(false)
const editingGroup = ref<BookGroup | null>(null)
const editName = ref('')

async function loadGroups() {
  loading.value = true
  try {
    const res = await groupApi.getBookGroups()
    if (res.isSuccess) {
      groups.value = res.data
    }
  } catch (e) {
    error('加载分组失败')
  } finally {
    loading.value = false
  }
}

function openAdd() {
  editingGroup.value = null
  editName.value = ''
  showEdit.value = true
}

function openEditGroup(group: BookGroup) {
  editingGroup.value = group
  editName.value = group.groupName
  showEdit.value = true
}

async function handleSave() {
  if (!editName.value.trim()) return
  
  try {
    const payload: Partial<BookGroup> = {
      groupName: editName.value
    }
    if (editingGroup.value) {
      payload.groupId = editingGroup.value.groupId
      payload.order = editingGroup.value.order
      payload.show = editingGroup.value.show
    }

    const res = await groupApi.saveBookGroup(payload)
    if (res.isSuccess) {
      success(editingGroup.value ? '修改成功' : '添加成功')
      showEdit.value = false
      loadGroups()
    } else {
      error(res.errorMsg || '操作失败')
    }
  } catch (e) {
    error('操作出错')
  }
}

async function handleDelete(group: BookGroup) {
  if (!confirm(`确定删除分组「${group.groupName}」？`)) return
  try {
    const res = await groupApi.deleteBookGroup(group.groupId)
    if (res.isSuccess) {
      success('删除成功')
      loadGroups()
    }
  } catch (e) {
    error('删除失败')
  }
}

async function toggleShow(group: BookGroup) {
  try {
    // Optimistic
    group.show = !group.show
    const res = await groupApi.saveBookGroup(group)
    if (!res.isSuccess) {
      group.show = !group.show
      error('更新失败')
    }
  } catch (e) {
    group.show = !group.show
    error('更新出错')
  }
}

async function moveGroup(index: number, direction: 'up' | 'down') {
  if (direction === 'up' && index === 0) return
  if (direction === 'down' && index === groups.value.length - 1) return

  const newGroups = [...groups.value]
  const targetIndex = direction === 'up' ? index - 1 : index + 1
  const temp = newGroups[index]
  newGroups[index] = newGroups[targetIndex]
  newGroups[targetIndex] = temp
  
  // Update UI immediately
  groups.value = newGroups

  // Save order
  try {
    const orderData = newGroups.map((g, i) => ({
      groupId: g.groupId,
      order: i
    }))
    const res = await groupApi.saveBookGroupOrder(orderData)
    if (res.isSuccess) {
      // success('排序已保存')
    } else {
      error('保存排序失败')
      loadGroups() // revert
    }
  } catch (e) {
    error('保存排序出错')
    loadGroups()
  }
}

function goBack() {
  router.push('/')
}

onMounted(() => {
  loadGroups()
})
</script>

<template>
  <div class="min-h-screen bg-background">
    <header class="sticky top-0 z-50 w-full bg-background/95 backdrop-blur border-b">
      <div class="container mx-auto flex h-14 max-w-screen-2xl items-center justify-between px-4">
        <div class="flex items-center gap-4">
          <Button variant="ghost" size="icon" @click="goBack">
            <ArrowLeft class="h-4 w-4" />
          </Button>
          <div>
            <h1 class="font-semibold">分组管理</h1>
            <p class="text-xs text-muted-foreground">管理书籍分组</p>
          </div>
        </div>
        <Button variant="default" size="sm" @click="openAdd">
          <Plus class="h-4 w-4 mr-1" />
          新增
        </Button>
      </div>
    </header>

    <main class="container mx-auto max-w-screen-2xl px-4 py-6">
      <div v-if="loading" class="space-y-3">
        <SkeletonLoader v-for="i in 5" :key="i" type="text" :lines="1" />
      </div>

      <div v-else-if="groups.length > 0" class="rounded-lg border divide-y">
        <div 
          v-for="(group, index) in groups" 
          :key="group.groupId"
          class="flex items-center justify-between p-4 bg-card"
        >
          <div class="flex items-center gap-3">
            <div class="flex flex-col gap-1">
              <span class="font-medium">{{ group.groupName }}</span>
              <span class="text-xs text-muted-foreground">ID: {{ group.groupId }}</span>
            </div>
          </div>
          
          <div class="flex items-center gap-2">
            <div 
              class="cursor-pointer px-2 py-1 rounded hover:bg-muted text-xs font-medium mr-2"
              :class="group.show ? 'text-green-600' : 'text-gray-400'"
              @click="toggleShow(group)"
            >
              {{ group.show ? '显示' : '隐藏' }}
            </div>

            <div class="flex flex-col gap-1 mr-2">
              <Button variant="ghost" size="icon" class="h-6 w-6" :disabled="index === 0" @click="moveGroup(index, 'up')">
                <ArrowUp class="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" class="h-6 w-6" :disabled="index === groups.length - 1" @click="moveGroup(index, 'down')">
                <ArrowDown class="h-3 w-3" />
              </Button>
            </div>

            <Button variant="ghost" size="icon" class="h-8 w-8" @click="openEditGroup(group)">
              <Edit2 class="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" class="h-8 w-8 text-destructive" @click="handleDelete(group)">
              <Trash2 class="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div v-else class="text-center py-12 text-muted-foreground">
        暂无分组
      </div>
    </main>

    <Sheet v-model:open="showEdit">
      <SheetContent side="bottom" class="rounded-t-xl h-auto pb-8">
        <SheetHeader class="mb-4">
          <SheetTitle>{{ editingGroup ? '编辑分组' : '新增分组' }}</SheetTitle>
        </SheetHeader>
        <div class="space-y-4">
          <div class="space-y-2">
             <label class="text-sm font-medium">分组名称</label>
             <Input v-model="editName" placeholder="请输入分组名称" @keyup.enter="handleSave" />
          </div>
          <Button class="w-full" @click="handleSave">保存</Button>
        </div>
      </SheetContent>
    </Sheet>
  </div>
</template>
