<script setup lang="ts">
import { Server, Upload } from 'lucide-vue-next'
import { EmptyState } from '@/components/common'

defineProps<{
  searchKeyword: string
  activeGroup: string
}>()

const emit = defineEmits<{
  'open-import': []
  'reset-filters': []
}>()
</script>

<template>
  <EmptyState
    :icon="Server"
    :title="
      searchKeyword
        ? '未找到匹配的书源'
        : activeGroup === '全部'
          ? '暂无书源'
          : `「${activeGroup}」分组为空`
    "
    :description="
      searchKeyword
        ? '尝试更换搜索关键词'
        : activeGroup === '全部'
          ? '导入书源开始使用'
          : '切换到其他分组或导入新书源'
    "
    :actions="[
      {
        label: '导入书源',
        icon: Upload,
        onClick: () => emit('open-import'),
      },
      ...(searchKeyword || activeGroup !== '全部'
        ? [
            {
              label: '查看全部',
              onClick: () => emit('reset-filters'),
              variant: 'outline' as const,
            },
          ]
        : []),
    ]"
  />
</template>
