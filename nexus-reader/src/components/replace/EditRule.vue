<script setup lang="ts">
import { useEditRuleView } from '@/composables/useEditRuleView'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { ReplaceRule } from '@/types/replace'

const props = withDefaults(defineProps<{
  open?: boolean
  rule?: ReplaceRule | null
}>(), {
  open: false
})

const emit = defineEmits<{
  'update:open': [value: boolean]
  'saved': []
}>()

const { loading, form, handleSave } = useEditRuleView({
  props,
  close: () => emit('update:open', false),
  notifySaved: () => emit('saved'),
})
</script>

<template>
  <Sheet :open="open" @update:open="emit('update:open', $event)">
    <SheetContent class="w-full sm:max-w-md flex flex-col h-full rounded-l-xl">
      <SheetHeader class="mb-4">
        <SheetTitle>{{ rule ? '编辑替换规则' : '新增替换规则' }}</SheetTitle>
      </SheetHeader>

      <div class="flex-1 flex flex-col gap-5 overflow-y-auto p-1">
        <div class="space-y-2">
          <label class="text-sm font-medium">规则名称</label>
          <Input v-model="form.name" placeholder="请输入规则名称" />
        </div>
        
        <div class="space-y-2">
          <label class="text-sm font-medium">替换规则 (Pattern)</label>
          <Input v-model="form.pattern" placeholder="要查找的内容" />
        </div>

        <div class="space-y-2">
          <label class="text-sm font-medium">替换为 (Replacement)</label>
          <Input v-model="form.replacement" placeholder="留空则删除" />
        </div>

        <div class="space-y-2">
          <label class="text-sm font-medium">作用范围 (Scope)</label>
          <Input v-model="form.scope" placeholder="书源 ID，留空表示全局" />
          <p class="text-xs text-muted-foreground">Phase 0 仅支持全局规则或指定书源 ID</p>
        </div>

        <div class="flex items-center gap-4 py-2">
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" v-model="form.isRegex" class="w-4 h-4 rounded border-gray-300">
            <span class="text-sm">使用正则</span>
          </label>
          
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" v-model="form.isEnabled" class="w-4 h-4 rounded border-gray-300">
            <span class="text-sm">启用规则</span>
          </label>
        </div>
      </div>

      <SheetFooter class="mt-4">
        <Button class="w-full" :disabled="loading" @click="handleSave">
          {{ loading ? '保存中...' : '确认保存' }}
        </Button>
      </SheetFooter>
    </SheetContent>
  </Sheet>
</template>
