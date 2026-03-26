<script setup lang="ts">
import { useEditSourceView } from '@/composables/useEditSourceView'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import type { BookSource } from '@/types/source'

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

const {
  loading,
  saving,
  jsonText,
  canEditPolicy,
  publicAccessEnabled,
  licenseStatus,
  accessMode,
  lastVerifiedAt,
  notes,
  licenseOptions,
  accessModeOptions,
  savePolicy,
} = useEditSourceView({ props })

async function handleSavePolicy() {
  const result = await savePolicy()
  if (result) {
    emit('saved')
  }
}
</script>

<template>
  <Sheet :open="open" @update:open="emit('update:open', $event)">
    <SheetContent class="w-full sm:max-w-xl flex flex-col h-full rounded-l-xl">
      <SheetHeader class="mb-4">
        <SheetTitle>书源详情与治理</SheetTitle>
      </SheetHeader>

      <div class="space-y-5 pb-5">
        <div class="rounded-xl border bg-muted/20 p-4 space-y-4">
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="text-sm font-medium text-foreground">
                {{ source?.name || '未命名书源' }}
              </p>
              <p class="text-xs text-muted-foreground mt-1">
                {{ source?.id || '缺少 source id' }}
              </p>
            </div>
            <Badge :variant="publicAccessEnabled ? 'secondary' : 'outline'">
              {{ publicAccessEnabled ? '可公开接入' : '未进入公开链路' }}
            </Badge>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label for="license-status">授权状态</Label>
              <select
                id="license-status"
                v-model="licenseStatus"
                class="w-full h-10 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                :disabled="!canEditPolicy || saving"
              >
                <option
                  v-for="option in licenseOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </div>

            <div class="space-y-2">
              <Label for="access-mode">接入方式</Label>
              <select
                id="access-mode"
                v-model="accessMode"
                class="w-full h-10 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                :disabled="!canEditPolicy || saving"
              >
                <option
                  v-for="option in accessModeOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </div>
          </div>

          <div class="space-y-2">
            <Label for="verified-at">最近审核时间</Label>
            <input
              id="verified-at"
              v-model="lastVerifiedAt"
              type="datetime-local"
              class="w-full h-10 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              :disabled="!canEditPolicy || saving"
            />
          </div>

          <div class="space-y-2">
            <Label for="policy-notes">审核备注</Label>
            <textarea
              id="policy-notes"
              v-model="notes"
              class="w-full min-h-24 rounded-md border bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="记录来源说明、授权证明或运营备注"
              :disabled="!canEditPolicy || saving"
            />
          </div>
        </div>
      </div>

      <div class="flex-1 min-h-0">
        <textarea
          v-model="jsonText"
          class="w-full h-full p-4 rounded-md border bg-muted/30 font-mono text-xs resize-none focus:outline-none focus:ring-2 focus:ring-ring"
          spellcheck="false"
          readonly
        ></textarea>
      </div>

      <SheetFooter class="mt-4 flex-col sm:flex-row gap-2">
        <Button
          class="w-full"
          :disabled="!canEditPolicy || saving || loading"
          @click="handleSavePolicy"
        >
          {{ saving ? '保存中...' : '保存治理策略' }}
        </Button>
        <Button class="w-full" variant="outline" @click="emit('update:open', false)">
          关闭
        </Button>
      </SheetFooter>
    </SheetContent>
  </Sheet>
</template>
