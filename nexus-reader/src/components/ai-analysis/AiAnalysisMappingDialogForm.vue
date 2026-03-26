<script setup lang="ts">
/* eslint-disable vue/no-mutating-props */
import { computed } from 'vue'
import { Switch } from '@/components/ui/switch'
import type { AiMappingDraft } from '@/utils/aiAnalysisTransfer'

const props = defineProps<{
  draft: AiMappingDraft
}>()

const original = computed({
  get: () => props.draft.original,
  set: value => {
    props.draft.original = value
  },
})

const target = computed({
  get: () => props.draft.target,
  set: value => {
    props.draft.target = value
  },
})

const type = computed({
  get: () => props.draft.type,
  set: value => {
    props.draft.type = value
  },
})

const confidence = computed({
  get: () => props.draft.confidence,
  set: value => {
    props.draft.confidence = value
  },
})

const enabled = computed({
  get: () => props.draft.enabled,
  set: value => {
    props.draft.enabled = value
  },
})
</script>

<template>
  <div class="space-y-4">
    <div>
      <label class="text-sm font-medium mb-2 block">原文</label>
      <input
        v-model="original"
        type="text"
        placeholder="例如：周洁仑"
        class="w-full px-4 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </div>

    <div>
      <label class="text-sm font-medium mb-2 block">目标名称</label>
      <input
        v-model="target"
        type="text"
        placeholder="例如：周杰伦"
        class="w-full px-4 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </div>

    <div>
      <label class="text-sm font-medium mb-2 block">类型</label>
      <select
        v-model="type"
        class="w-full px-4 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <option value="person">人物</option>
        <option value="company">公司</option>
        <option value="department">部门</option>
        <option value="location">地点</option>
        <option value="other">其他</option>
      </select>
    </div>

    <div>
      <label class="text-sm font-medium mb-2 block">
        置信度: {{ Math.round((confidence ?? 0.8) * 100) }}%
      </label>
      <input
        v-model.number="confidence"
        type="range"
        min="0"
        max="1"
        step="0.1"
        class="w-full"
      />
    </div>

    <div class="flex items-center justify-between">
      <span class="text-sm font-medium">启用</span>
      <Switch v-model:checked="enabled" />
    </div>
  </div>
</template>
