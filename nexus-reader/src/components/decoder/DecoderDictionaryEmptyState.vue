<script setup lang="ts">
import {
  BookOpen,
  Plus,
} from 'lucide-vue-next'
import { EmptyState } from '@/components/common'

interface Props {
  searchKeyword: string
}

defineProps<Props>()

const emit = defineEmits<{
  edit: []
  'clear-search': []
}>()
</script>

<template>
  <EmptyState
    :icon="BookOpen"
    :title="searchKeyword ? '未找到匹配的词条' : '暂无词条'"
    :description="searchKeyword ? '尝试更换搜索关键词' : '添加词条来帮助解密加密内容'"
    :actions="[
      {
        label: '新增词条',
        icon: Plus,
        onClick: () => emit('edit'),
      },
      ...(searchKeyword
        ? [
            {
              label: '查看全部',
              onClick: () => emit('clear-search'),
              variant: 'outline' as const,
            },
          ]
        : []),
    ]"
  />
</template>
