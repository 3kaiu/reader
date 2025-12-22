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
import { sourceApi, type BookSource } from '@/api/source'

const props = withDefaults(defineProps<{
  open?: boolean
  source?: BookSource | null
}>(), {
  open: false
})

const emit = defineEmits<{
  'update:open': [value: boolean]
  'saved': []
}>()

const message = useMessage()
const loading = ref(false)
const jsonText = ref('')

watch(() => props.open, (val) => {
  if (val && props.source) {
    // 格式化 JSON
    jsonText.value = JSON.stringify(props.source, null, 2)
  }
})

async function handleSave() {
  if (!jsonText.value.trim()) return
  
  loading.value = true
  try {
    // 验证 JSON
    JSON.parse(jsonText.value)
    
    // 保存
    const res = await sourceApi.saveBookSource(jsonText.value)
    if (res.isSuccess) {
      message.success('保存成功')
      emit('saved')
      emit('update:open', false)
    } else {
      message.error(res.errorMsg || '保存失败')
    }
  } catch (err) {
    if (err instanceof SyntaxError) {
      message.error('JSON 格式错误')
    } else {
      message.error('保存出错')
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <Sheet :open="open" @update:open="emit('update:open', $event)">
    <SheetContent class="w-full sm:max-w-lg flex flex-col h-full rounded-l-xl">
      <SheetHeader class="mb-4">
        <SheetTitle>编辑书源</SheetTitle>
      </SheetHeader>

      <div class="flex-1 min-h-0">
        <textarea
          v-model="jsonText"
          class="w-full h-full p-4 rounded-md border bg-muted/30 font-mono text-xs resize-none focus:outline-none focus:ring-2 focus:ring-ring"
          spellcheck="false"
        ></textarea>
      </div>

      <SheetFooter class="mt-4">
        <Button class="w-full" :disabled="loading" @click="handleSave">
          {{ loading ? '保存中...' : '保存修改' }}
        </Button>
      </SheetFooter>
    </SheetContent>
  </Sheet>
</template>
