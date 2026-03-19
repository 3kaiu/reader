<script setup lang="ts">
import { ref, watch } from 'vue'
import { useMessage } from '@/composables/useMessage'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { replaceApi, type ReplaceRule } from '@/api/replace'

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

const message = useMessage()
const loading = ref(false)

type ReplaceRuleForm = {
  id?: string
  name: string
  pattern: string
  replacement: string
  scope: string
  isEnabled: boolean
  isRegex: boolean
}

function createEmptyForm(): ReplaceRuleForm {
  return {
    name: '',
    pattern: '',
    replacement: '',
    scope: '',
    isEnabled: true,
    isRegex: false
  }
}

function toForm(rule?: ReplaceRule | null): ReplaceRuleForm {
  if (!rule) return createEmptyForm()

  return {
    id: rule.id,
    name: rule.name,
    pattern: rule.pattern,
    replacement: rule.replacement || '',
    scope: rule.scope || '',
    isEnabled: rule.isEnabled,
    isRegex: rule.isRegex
  }
}

const form = ref<ReplaceRuleForm>({
  id: undefined,
  name: '',
  pattern: '',
  replacement: '',
  scope: '',
  isEnabled: true,
  isRegex: false
})

watch(() => props.open, (val) => {
  if (val) {
    form.value = toForm(props.rule)
  }
})

async function handleSave() {
  if (!form.value.name.trim()) {
    message.warning('请输入规则名称')
    return
  }
  if (!form.value.pattern.trim()) {
    message.warning('请输入替换规则')
    return
  }

  loading.value = true
  try {
    const res = await replaceApi.saveReplaceRule({
      ...form.value,
      name: form.value.name.trim(),
      pattern: form.value.pattern.trim()
    })
    if (res.isSuccess) {
      message.success(props.rule ? '修改成功' : '新增成功')
      emit('saved')
      emit('update:open', false)
    } else {
      message.error(res.errorMsg || '保存失败')
    }
  } catch (err) {
    message.error('保存出错')
  } finally {
    loading.value = false
  }
}
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
