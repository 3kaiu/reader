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
import { Checkbox } from '@/components/ui/checkbox' // Need to check if exists
import { Label } from '@/components/ui/label' // Need to check if exists
import { replaceApi, type ReplaceRule } from '@/api/replace'

// Assuming Shadcn Input/Button available. 
// If Checkbox/Label missing, use HTML standard or Naive UI.
// I'll use standard HTML input keys for checkbox to be safe if Checkbox component not verified.
// Actually list_dir showed input, button... not sure about checkbox.
// I'll simple HTML for checkbox to avoid errors.

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

const form = ref<ReplaceRule>({
  name: '',
  pattern: '',
  replacement: '',
  scope: '',
  isEnabled: true,
  isRegex: false
})

watch(() => props.open, (val) => {
  if (val) {
    if (props.rule) {
      form.value = { ...props.rule }
    } else {
      // Reset
      form.value = {
        name: '',
        pattern: '',
        replacement: '',
        scope: '',
        isEnabled: true,
        isRegex: false
      }
    }
  }
})

async function handleSave() {
  if (!form.value.name) {
    message.warning('请输入规则名称')
    return
  }
  if (!form.value.pattern) {
    message.warning('请输入替换规则')
    return
  }

  loading.value = true
  try {
    const res = await replaceApi.saveReplaceRule(form.value)
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
          <Input v-model="form.scope" placeholder="书名或正则，留空作用于所有" />
          <p class="text-xs text-muted-foreground">可填写书名、作者或"所有"/"全局"</p>
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
