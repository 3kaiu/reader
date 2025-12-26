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
import { useConfirm } from '@/composables/useConfirm'

const { isOpen, options, handleConfirm, handleCancel } = useConfirm()
</script>

<template>
  <AlertDialog :open="isOpen" @update:open="(val) => !val && handleCancel()">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ options.title || '确认操作' }}</AlertDialogTitle>
        <AlertDialogDescription>
          {{ options.description || '您确定要执行此操作吗？' }}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel @click="handleCancel">
          {{ options.cancelText || '取消' }}
        </AlertDialogCancel>
        <AlertDialogAction
          :variant="options.variant || 'default'"
          @click="handleConfirm"
        >
          {{ options.confirmText || '确定' }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
