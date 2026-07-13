<script setup lang="ts">
import { Search } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'

const emit = defineEmits<{
  (e: 'reset-search'): void
  (e: 'go-back'): void
}>()
</script>

<template>
  <div
    class="flex flex-col items-center justify-center py-20 animate-in fade-in zoom-in-95 duration-500"
  >
    <div class="flex items-center gap-3 mb-4">
      <Search class="h-8 w-8 text-muted-foreground/60" />
      <h3 class="text-lg font-semibold">未找到相关书籍</h3>
    </div>
    <p class="text-muted-foreground/80 text-center max-w-xs mb-8">
      尝试更换搜索关键词或检查输入是否正确
    </p>
    <div class="flex gap-3">
      <Button variant="outline" class="rounded-full" @click="emit('reset-search')">
        重新搜索
      </Button>
      <Button variant="ghost" class="rounded-full" @click="emit('go-back')"> 返回书架 </Button>
    </div>
  </div>
</template>
