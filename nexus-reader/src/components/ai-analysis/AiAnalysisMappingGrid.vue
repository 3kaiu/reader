<script setup lang="ts">
import {
  Brain,
  Edit,
  Plus,
  Trash2,
} from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { EmptyState } from '@/components/common'
import { AI_MAPPING_TYPE_CONFIG } from '@/constants/aiAnalysis'
import type { AiMappingRule } from '@/types/ai-analysis'

interface Props {
  mappings: AiMappingRule[]
  searchKeyword: string
}

defineProps<Props>()

const emit = defineEmits<{
  add: []
  edit: [rule: AiMappingRule]
  delete: [rule: AiMappingRule]
  toggle: [rule: AiMappingRule, enabled: boolean]
  'clear-search': []
}>()
</script>

<template>
  <EmptyState
    v-if="mappings.length === 0"
    :icon="Brain"
    :title="searchKeyword ? '未找到匹配的规则' : '暂无映射规则'"
    :description="
      searchKeyword
        ? '尝试更换搜索关键词'
        : '添加映射规则以帮助 AI 更好地识别文本中的映射关系'
    "
    :actions="[
      searchKeyword
        ? {
            label: '查看全部',
            onClick: () => emit('clear-search'),
            variant: 'outline',
          }
        : {
            label: '添加映射规则',
            icon: Plus,
            onClick: () => emit('add'),
          },
    ]"
  />

  <div
    v-else
    class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500 mb-8"
  >
    <div
      v-for="mapping in mappings"
      :key="mapping.id"
      class="group relative bg-card hover:bg-muted/50 rounded-2xl border transition-all duration-200 overflow-hidden"
      :class="{
        'border-border/50 hover:border-border hover:shadow-md': mapping.enabled,
        'opacity-50 border-border/30': !mapping.enabled,
      }"
    >
      <div class="p-4 h-full flex flex-col gap-3">
        <div class="flex items-start gap-3">
          <div
            :class="[
              'w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
              AI_MAPPING_TYPE_CONFIG[mapping.type]?.color || 'bg-gray-500/10 text-gray-600',
            ]"
          >
            <component
              :is="AI_MAPPING_TYPE_CONFIG[mapping.type]?.icon || AI_MAPPING_TYPE_CONFIG.other.icon"
              class="h-5 w-5"
            />
          </div>

          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1 mb-1">
              <span class="font-semibold text-sm truncate">{{ mapping.original }}</span>
              <span class="text-muted-foreground text-xs">→</span>
              <span class="font-semibold text-sm text-primary truncate">{{ mapping.target }}</span>
            </div>
            <Badge
              :class="AI_MAPPING_TYPE_CONFIG[mapping.type]?.color || 'bg-gray-500/10 text-gray-600'"
              class="text-xs"
            >
              {{ AI_MAPPING_TYPE_CONFIG[mapping.type]?.label || '其他' }}
            </Badge>
          </div>
        </div>

        <div class="flex items-center justify-between text-xs text-muted-foreground">
          <span>置信度: {{ Math.round(mapping.confidence * 100) }}%</span>
          <span v-if="mapping.usageCount !== undefined">
            使用: {{ mapping.usageCount }}
          </span>
        </div>

        <div class="flex items-center gap-1.5 pt-2 border-t border-border/50">
          <Switch
            :checked="mapping.enabled"
            class="flex-1"
            @update:checked="(enabled: boolean) => emit('toggle', mapping, enabled)"
          />
          <Button
            variant="ghost"
            size="sm"
            class="h-7 px-2"
            title="编辑"
            @click="emit('edit', mapping)"
          >
            <Edit class="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            class="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
            title="删除"
            @click="emit('delete', mapping)"
          >
            <Trash2 class="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
