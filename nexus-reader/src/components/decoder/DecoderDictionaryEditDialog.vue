<script setup lang="ts">
/* eslint-disable vue/no-mutating-props */
import { computed } from 'vue'
import { Button } from '@/components/ui/button'
import { DECODER_CATEGORY_OPTIONS } from '@/constants/decoderDictionary'
import type { DictionaryEntry } from '@/types/decoder'
import {
  getDecoderEntryScopeLabel,
  type DecoderEntryDraft,
} from '@/utils/decoderDictionary'

interface Props {
  open: boolean
  currentEditEntry: Partial<DictionaryEntry> | null
  editForm: DecoderEntryDraft
}

const props = defineProps<Props>()

const emit = defineEmits<{
  close: []
  save: []
}>()

const original = computed({
  get: () => props.editForm.original,
  set: value => {
    props.editForm.original = value
  },
})

const real = computed({
  get: () => props.editForm.real,
  set: value => {
    props.editForm.real = value
  },
})

const category = computed({
  get: () => props.editForm.category,
  set: value => {
    props.editForm.category = value
  },
})

const description = computed({
  get: () => props.editForm.description,
  set: value => {
    props.editForm.description = value
  },
})

const aliases = computed({
  get: () => props.editForm.aliases,
  set: value => {
    props.editForm.aliases = value
  },
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      @click.self="emit('close')"
    >
      <div class="bg-background rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
        <h2 class="text-lg font-semibold mb-4">
          {{ currentEditEntry ? '编辑词条' : '新增词条' }}
        </h2>

        <div class="space-y-4">
          <div class="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            {{
              currentEditEntry
                ? `当前作用域：${getDecoderEntryScopeLabel(currentEditEntry)}`
                : '新建词条默认保存到公共词典；当前页面不提供书籍级或分类级新建入口。'
            }}
          </div>

          <div>
            <label class="text-sm text-muted-foreground mb-1 block">加密词</label>
            <input
              v-model="original"
              type="text"
              class="w-full px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="如: 马芸"
            />
          </div>

          <div>
            <label class="text-sm text-muted-foreground mb-1 block">真实指代</label>
            <input
              v-model="real"
              type="text"
              class="w-full px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="如: 马云"
            />
          </div>

          <div>
            <label class="text-sm text-muted-foreground mb-1 block">类别</label>
            <select
              v-model="category"
              class="w-full px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option
                v-for="option in DECODER_CATEGORY_OPTIONS"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </div>

          <div>
            <label class="text-sm text-muted-foreground mb-1 block">描述 (可选)</label>
            <input
              v-model="description"
              type="text"
              class="w-full px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="如: 阿里巴巴创始人"
            />
          </div>

          <div>
            <label class="text-sm text-muted-foreground mb-1 block">别名 (可选，逗号分隔)</label>
            <input
              v-model="aliases"
              type="text"
              class="w-full px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="如: 杰克马, 风清扬"
            />
          </div>
        </div>

        <div class="flex gap-3 mt-6">
          <Button variant="outline" class="flex-1" @click="emit('close')">
            取消
          </Button>
          <Button class="flex-1" @click="emit('save')">
            保存
          </Button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
