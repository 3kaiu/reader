<script setup lang="ts">
import { ref, watch } from 'vue'
import { useMoveBookDialogView } from '@/composables/useMoveBookDialogView'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { FolderHeart, Check } from 'lucide-vue-next'
import type { BookGroup } from '@/types/group'

const props = defineProps<{
  open: boolean
  groups: BookGroup[]
  selectedCount: number
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'confirm', groupId: string | null): void
}>()

const dialogRef = ref<HTMLDialogElement>()

const { selectedId, selectGroup, handleConfirm } = useMoveBookDialogView({
  open: props.open,
  groups: props.groups,
  onConfirm: groupId => emit('confirm', groupId),
  onClose: () => emit('update:open', false),
})

// Sync dialog open state with prop
watch(
  () => props.open,
  open => {
    if (!dialogRef.value) return
    if (open && !dialogRef.value.open) {
      dialogRef.value.showModal()
    } else if (!open && dialogRef.value.open) {
      dialogRef.value.close()
    }
  }
)

// Handle native dialog close
function onDialogClose() {
  if (props.open) {
    emit('update:open', false)
  }
}

// Handle cancel event (Escape key)
function onDialogCancel(e: Event) {
  e.preventDefault()
  emit('update:open', false)
}

// Handle backdrop click
function onBackdropClick(e: MouseEvent) {
  if (e.target === dialogRef.value) {
    emit('update:open', false)
  }
}
</script>

<template>
  <dialog
    ref="dialogRef"
    class="fixed inset-0 z-50 m-auto w-full max-w-md rounded-3xl border-none bg-card p-0 shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-sm"
    @close="onDialogClose"
    @cancel="onDialogCancel"
    @click="onBackdropClick"
  >
    <!-- Header -->
    <div class="flex items-center gap-3 p-6 pb-2">
      <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
        <FolderHeart class="h-5 w-5 text-primary" />
      </div>
      <h2 class="text-xl font-bold">移动到分组</h2>
    </div>

    <!-- Content -->
    <div class="px-6 py-2">
      <p class="mb-4 text-sm text-muted-foreground">将选中的 {{ selectedCount }} 本书籍移动至...</p>

      <ScrollArea class="h-64 -mr-4 pr-4">
        <div class="space-y-2 pb-4">
          <!-- 未分组选项 -->
          <button
            class="flex w-full items-center justify-between rounded-2xl border-2 p-4 transition-all"
            :class="
              selectedId === null
                ? 'border-primary bg-primary/5'
                : 'border-transparent bg-muted/30 hover:bg-muted/50'
            "
            @click="selectGroup(null)"
          >
            <div class="flex items-center gap-3">
              <div
                class="flex h-8 w-8 items-center justify-center rounded-lg bg-background"
              >
                <FolderHeart class="h-4 w-4 text-muted-foreground/40" />
              </div>
              <span class="text-sm font-medium">不设置分组</span>
            </div>
            <Check v-if="selectedId === null" class="h-4 w-4 text-primary" />
          </button>

          <!-- 已有分组列表 -->
          <button
            v-for="group in groups"
            :key="group.groupId"
            class="flex w-full items-center justify-between rounded-2xl border-2 p-4 transition-all"
            :class="
              selectedId === group.groupId
                ? 'border-primary bg-primary/5'
                : 'border-transparent bg-muted/30 hover:bg-muted/50'
            "
            @click="selectGroup(group.groupId as string)"
          >
            <div class="flex items-center gap-3">
              <div
                class="flex h-8 w-8 items-center justify-center rounded-lg bg-background"
              >
                <FolderHeart class="h-4 w-4 text-primary/60" />
              </div>
              <span class="text-sm font-medium">{{ group.groupName }}</span>
            </div>
            <Check v-if="selectedId === group.groupId" class="h-4 w-4 text-primary" />
          </button>
        </div>
      </ScrollArea>
    </div>

    <!-- Footer -->
    <div class="flex gap-3 p-6 pt-2 sm:gap-0">
      <Button variant="ghost" class="flex-1 rounded-full px-8 sm:flex-none" @click="emit('update:open', false)">
        取消
      </Button>
      <Button class="flex-1 rounded-full px-8 sm:flex-none" @click="handleConfirm"> 确定移动 </Button>
    </div>
  </dialog>
</template>
