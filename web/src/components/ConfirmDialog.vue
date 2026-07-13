<script setup lang="ts">
/**
 * 全局确认对话框组件 - 使用原生 <dialog> 元素
 * 配合 useConfirm composable 使用
 */
import { computed, ref, watch } from 'vue'
import { useConfirm } from '@/composables/useConfirm'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const { confirmDialog, handleConfirm } = useConfirm()
const dialogRef = ref<HTMLDialogElement>()

const resolvedOptions = computed(() => {
  return (
    confirmDialog.value.options ?? {
      message: '',
      title: undefined,
      description: undefined,
      confirmText: undefined,
      cancelText: undefined,
      type: 'info',
      variant: 'default',
    }
  )
})

// Sync dialog open state with confirmDialog.visible
watch(
  () => confirmDialog.value.visible,
  visible => {
    if (!dialogRef.value) return
    if (visible && !dialogRef.value.open) {
      dialogRef.value.showModal()
    } else if (!visible && dialogRef.value.open) {
      dialogRef.value.close()
    }
  }
)

// Handle native dialog close (Escape key or backdrop click)
function onDialogClose() {
  if (confirmDialog.value.visible) {
    handleConfirm(false)
  }
}

// Handle cancel event (Escape key) - treat as cancel
function onDialogCancel(e: Event) {
  e.preventDefault()
  handleConfirm(false)
}

// Use pointerdown to set confirm flag BEFORE dialog closes
function onConfirmPointerDown() {
  handleConfirm(true)
}

// Prevent backdrop click from closing dialog (optional - remove if you want backdrop click to close)
function onBackdropClick(e: MouseEvent) {
  if (e.target === dialogRef.value) {
    handleConfirm(false)
  }
}
</script>

<template>
  <dialog
    ref="dialogRef"
    class="fixed inset-0 z-50 m-auto w-full max-w-lg rounded-2xl border bg-card p-0 shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-sm"
    @close="onDialogClose"
    @cancel="onDialogCancel"
    @click="onBackdropClick"
  >
    <div class="flex flex-col gap-4 p-6">
      <!-- Header -->
      <div class="flex flex-col gap-2">
        <h2 class="text-lg font-semibold leading-none tracking-tight">
          {{ resolvedOptions.title || '确认操作' }}
        </h2>
        <p class="text-sm text-muted-foreground">
          {{ resolvedOptions.description || '您确定要执行此操作吗？' }}
        </p>
      </div>

      <!-- Footer -->
      <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" @click="handleConfirm(false)">
          {{ resolvedOptions.cancelText || '取消' }}
        </Button>
        <Button
          :variant="resolvedOptions.variant === 'destructive' ? 'destructive' : 'default'"
          :class="
            cn(
              resolvedOptions.variant === 'destructive' &&
                'bg-destructive text-destructive-foreground hover:bg-destructive/90'
            )
          "
          @pointerdown="onConfirmPointerDown"
        >
          {{ resolvedOptions.confirmText || '确定' }}
        </Button>
      </div>
    </div>
  </dialog>
</template>
