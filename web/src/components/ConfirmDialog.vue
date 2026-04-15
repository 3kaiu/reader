<script setup lang="ts">
/**
 * 全局确认对话框组件
 * 配合 useConfirm composable 使用
 */
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { computed } from 'vue'
import { useConfirm } from '@/composables/useConfirm'

const { confirmDialog, handleConfirm } = useConfirm()

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

// Use pointerdown to set confirm flag BEFORE dialog auto-closes
function onConfirmPointerDown() {
  // Set flag immediately on pointer down, before click fires
  handleConfirm(true)
}

// Handle overlay/escape close - treat as cancel
function onOpenChange(val: boolean) {
  if (!val) {
    handleConfirm(false)
  }
}
</script>

<template>
  <AlertDialog :open="confirmDialog.visible" @update:open="onOpenChange">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ resolvedOptions.title || '确认操作' }}</AlertDialogTitle>
        <AlertDialogDescription>
          {{ resolvedOptions.description || '您确定要执行此操作吗？' }}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>
          {{ resolvedOptions.cancelText || '取消' }}
        </AlertDialogCancel>
        <AlertDialogAction
          :variant="(resolvedOptions.variant ?? 'default') as any"
          @pointerdown="onConfirmPointerDown"
        >
          {{ resolvedOptions.confirmText || '确定' }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
