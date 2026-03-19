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

watch(() => props.open, async (val) => {
  if (val && props.source) {
    jsonText.value = JSON.stringify(props.source, null, 2)

    if (!props.source.id) {
      return
    }

    loading.value = true
    try {
      const res = await sourceApi.getBookSource(props.source.id)
      if (res.isSuccess && res.data) {
        jsonText.value = JSON.stringify(res.data, null, 2)
      }
    } catch (err) {
      message.warning('无法加载最新书源定义，已显示当前列表中的数据')
    } finally {
      loading.value = false
    }
  }
})
</script>

<template>
  <Sheet :open="open" @update:open="emit('update:open', $event)">
    <SheetContent class="w-full sm:max-w-lg flex flex-col h-full rounded-l-xl">
      <SheetHeader class="mb-4">
        <SheetTitle>书源详情</SheetTitle>
      </SheetHeader>

      <div class="flex-1 min-h-0">
        <textarea
          v-model="jsonText"
          class="w-full h-full p-4 rounded-md border bg-muted/30 font-mono text-xs resize-none focus:outline-none focus:ring-2 focus:ring-ring"
          spellcheck="false"
          readonly
        ></textarea>
      </div>

      <SheetFooter class="mt-4">
        <Button class="w-full" variant="outline" @click="emit('update:open', false)">
          关闭
        </Button>
      </SheetFooter>
    </SheetContent>
  </Sheet>
</template>
