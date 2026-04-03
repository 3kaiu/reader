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
  diagnosticsLoading,
  resettingRuntime,
  jsonText,
  canEditPolicy,
  publicAccessEnabled,
  runtimeProfile,
  circuitState,
  runtimeError,
  diagnosticSuggestions,
  licenseStatus,
  accessMode,
  lastVerifiedAt,
  notes,
  licenseOptions,
  accessModeOptions,
  savePolicy,
  resetRuntimeState,
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
              <p class="text-sm font-medium text-foreground">运行时画像</p>
              <p class="text-xs text-muted-foreground mt-1">
                当前引擎对该源实际使用的抓取链路与治理参数。
              </p>
            </div>
            <Badge :variant="circuitState === 'open' ? 'destructive' : circuitState === 'closed' ? 'secondary' : 'outline'">
              熔断状态: {{ circuitState }}
            </Badge>
          </div>

          <p v-if="runtimeError" class="text-xs text-amber-600">
            {{ runtimeError }}
          </p>

          <div v-if="diagnosticsLoading" class="text-xs text-muted-foreground">
            运行时诊断加载中...
          </div>

          <template v-else>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div class="rounded-lg border bg-background px-3 py-2">
                <p class="text-[11px] text-muted-foreground">超时预算</p>
                <p class="text-sm font-medium mt-1">
                  {{ runtimeProfile?.timeoutMs ?? 0 }} ms
                </p>
              </div>
              <div class="rounded-lg border bg-background px-3 py-2">
                <p class="text-[11px] text-muted-foreground">重试预算</p>
                <p class="text-sm font-medium mt-1">
                  {{ runtimeProfile?.retryBudget ?? 0 }}
                </p>
              </div>
              <div class="rounded-lg border bg-background px-3 py-2">
                <p class="text-[11px] text-muted-foreground">并发上限</p>
                <p class="text-sm font-medium mt-1">
                  {{ runtimeProfile?.concurrencyLimit ?? 0 }}
                </p>
              </div>
            </div>

            <div class="space-y-2">
              <Label>策略链</Label>
              <div
                v-if="runtimeProfile?.strategyChain?.length"
                class="flex flex-wrap gap-2"
              >
                <Badge
                  v-for="strategy in runtimeProfile.strategyChain"
                  :key="strategy"
                  variant="outline"
                >
                  {{ strategy }}
                </Badge>
              </div>
              <p v-else class="text-xs text-muted-foreground">
                当前没有可用的运行时策略链信息
              </p>
            </div>

            <div
              v-if="source?.health"
              class="grid grid-cols-1 sm:grid-cols-2 gap-3"
            >
              <div class="rounded-lg border bg-background px-3 py-2">
                <p class="text-[11px] text-muted-foreground">健康摘要</p>
                <p class="text-sm font-medium mt-1">
                  分数 {{ Math.round((source.health.score || 0) * 100) }}
                  <span v-if="typeof source.health.healthPoints === 'number'">
                    · 积分 {{ source.health.healthPoints }}
                  </span>
                </p>
                <p class="text-[11px] text-muted-foreground mt-1">
                  成功 {{ source.health.successCount }} / 失败 {{ source.health.failureCount }}
                </p>
                <p
                  v-if="source.health.restoredFromSnapshot && source.health.snapshotUpdatedAtMs"
                  class="text-[11px] text-muted-foreground mt-1"
                >
                  快照恢复: {{ new Date(source.health.snapshotUpdatedAtMs).toLocaleString() }}
                </p>
                <p
                  v-if="typeof source.health.healthEventsSinceSnapshot === 'number'"
                  class="text-[11px] text-muted-foreground mt-1"
                >
                  快照后新增事件: 健康 {{ source.health.healthEventsSinceSnapshot || 0 }}
                  <span v-if="typeof source.health.extractionEventsSinceSnapshot === 'number'">
                    · 提取 {{ source.health.extractionEventsSinceSnapshot || 0 }}
                  </span>
                </p>
              </div>
              <div class="rounded-lg border bg-background px-3 py-2">
                <p class="text-[11px] text-muted-foreground">失败画像</p>
                <p class="text-sm font-medium mt-1">
                  {{ source.health.primaryFailure || 'none' }}
                </p>
                <p class="text-[11px] text-muted-foreground mt-1">
                  连败 {{ source.health.consecutiveFailures || 0 }} · 延迟 {{ source.health.avgLatencyMs || 0 }} ms
                </p>
                <p
                  v-if="source.health.lowConfidence"
                  class="text-[11px] text-amber-600 mt-1"
                >
                  当前治理诊断置信度偏低，建议继续积累运行样本后再做最终判断。
                </p>
              </div>
            </div>

            <div class="space-y-2">
              <Label>诊断建议</Label>
              <div
                v-if="diagnosticSuggestions.length > 0"
                class="space-y-2"
              >
                <div
                  v-for="item in diagnosticSuggestions"
                  :key="item.id"
                  class="rounded-lg border bg-background px-3 py-2"
                >
                  <p class="text-sm font-medium">{{ item.title }}</p>
                  <p class="text-[11px] text-muted-foreground mt-1">
                    {{ item.detail }}
                  </p>
                </div>
              </div>
              <p v-else class="text-xs text-muted-foreground">
                当前没有明显的治理异常，建议继续观察真实抓取样本。
              </p>
            </div>

            <div class="flex justify-end">
              <Button
                variant="outline"
                :disabled="resettingRuntime || loading || !source?.id"
                @click="resetRuntimeState('circuit_only')"
              >
                {{ resettingRuntime ? '重置中...' : '仅重置熔断' }}
              </Button>
              <Button
                variant="outline"
                class="ml-2"
                :disabled="resettingRuntime || loading || !source?.id"
                @click="resetRuntimeState('full')"
              >
                {{ resettingRuntime ? '重置中...' : '全量重置治理状态' }}
              </Button>
            </div>
          </template>
        </div>

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
