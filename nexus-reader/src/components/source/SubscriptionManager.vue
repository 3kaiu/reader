<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { ShieldAlert, Rss } from 'lucide-vue-next'
import { useMessage } from '@/composables/useMessage'

const { warning } = useMessage()

function showNotice() {
  warning('当前版本已临时下线订阅同步能力。')
}
</script>

<template>
  <div class="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
    <div class="flex items-center justify-between">
      <div class="space-y-1">
        <h2 class="text-lg font-semibold tracking-tight">订阅管理</h2>
        <p class="text-sm text-muted-foreground">
          Phase 0 先冻结该能力，避免前端继续调用未落地的订阅接口。
        </p>
      </div>
      <Button variant="outline" size="sm" @click="showNotice">
        查看说明
      </Button>
    </div>

    <div class="rounded-2xl border border-dashed bg-muted/10 p-8 text-center">
      <div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Rss class="h-6 w-6" />
      </div>
      <h3 class="text-base font-semibold">订阅同步已临时下线</h3>
      <p class="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
        当前后端契约未提供稳定的订阅、同步和实时日志接口。为保证核心阅读链路稳定，这一模块将在后续阶段基于真实接口重新接回。
      </p>
      <div class="mx-auto mt-6 flex max-w-md items-start gap-3 rounded-xl border bg-background/70 p-4 text-left">
        <ShieldAlert class="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
        <div class="text-sm text-muted-foreground">
          现在保留的核心能力是：书源导入、书架、搜索、目录、正文抓取与阅读。
        </div>
      </div>
    </div>
  </div>
</template>
