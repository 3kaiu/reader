<script setup lang="ts">
import { ref } from 'vue'
import { useMessage } from '@/composables/useMessage'
import { 
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Upload } from 'lucide-vue-next'
import { replaceApi, type ReplaceRule } from '@/api/replace'

const props = withDefaults(defineProps<{
  open?: boolean
}>(), {
  open: false
})

const emit = defineEmits<{
  'update:open': [value: boolean]
  'success': []
}>()

const message = useMessage()
const loading = ref(false)
const jsonText = ref('')

async function handleImport() {
  if (!jsonText.value.trim()) {
    message.warning('请输入内容')
    return
  }
  
  loading.value = true
  try {
    // 尝试解析
    let rules: ReplaceRule[] = []
    try {
      const parsed = JSON.parse(jsonText.value)
      if (Array.isArray(parsed)) {
        rules = parsed
      } else {
        rules = [parsed]
      }
    } catch (e) {
      message.error('JSON 格式错误')
      loading.value = false
      return
    }

    if (rules.length === 0) {
      message.warning('未找到有效的规则')
      loading.value = false
      return
    }

    const res = await replaceApi.saveReplaceRules(rules)
    if (res.isSuccess) {
      message.success(`成功导入 ${rules.length} 条规则`)
      emit('success')
      emit('update:open', false)
      jsonText.value = ''
    } else {
      message.error(res.errorMsg || '导入失败')
    }
  } catch (err) {
    message.error('导入出错')
  } finally {
    loading.value = false
  }
}

function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  
  const reader = new FileReader()
  reader.onload = (e) => {
    jsonText.value = e.target?.result as string
  }
  reader.readAsText(file)
}
</script>

<template>
  <Sheet :open="open" @update:open="emit('update:open', $event)">
    <SheetContent class="w-full sm:max-w-md flex flex-col h-full rounded-l-xl">
      <SheetHeader class="mb-4">
        <SheetTitle>导入替换规则</SheetTitle>
      </SheetHeader>

      <div class="flex-1 flex flex-col gap-3 min-h-0">
        <div class="relative flex-1">
          <textarea
            v-model="jsonText"
            class="w-full h-full p-3 rounded-md border bg-transparent resize-none focus:outline-none focus:ring-2 focus:ring-ring text-xs font-mono"
            placeholder='[{"name": "...", "pattern": "..."}]'
          ></textarea>
        </div>
        
        <div class="flex items-center justify-between">
          <span class="text-xs text-muted-foreground">支持 JSON 数组</span>
          <label class="cursor-pointer">
            <input type="file" accept=".json,.txt" class="hidden" @change="onFileChange">
            <span class="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-secondary hover:bg-secondary/80 transition-colors">
              <Upload class="h-3 w-3" />
              选择文件
            </span>
          </label>
        </div>
      </div>

      <SheetFooter class="mt-4">
        <Button class="w-full" :disabled="loading" @click="handleImport">
          {{ loading ? '导入中...' : '确认导入' }}
        </Button>
      </SheetFooter>
    </SheetContent>
  </Sheet>
</template>
