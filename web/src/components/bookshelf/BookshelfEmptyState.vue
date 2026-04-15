<script setup lang="ts">
import { BookOpen, Plus } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'

const emit = defineEmits<{
  search: []
}>()
</script>

<template>
  <div
    class="flex flex-col items-center justify-center py-20 animate-in fade-in zoom-in-95 duration-500"
  >
    <div class="flex items-center gap-3 mb-2">
      <BookOpen class="h-6 w-6 text-muted-foreground/60" />
      <h2 class="text-xl font-bold">开启阅读之旅</h2>
    </div>
    <p class="text-muted-foreground/80 text-center max-w-xs mb-8 leading-relaxed">
      书架空空如也，去探索一些有趣的故事吧
    </p>
    <Button size="lg" @click="emit('search')">
      <Plus class="h-4 w-4 mr-2" />
      添加书籍
    </Button>
  </div>
</template>
