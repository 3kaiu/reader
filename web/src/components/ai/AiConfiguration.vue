<script setup lang="ts">
/**
 * AI Decoder settings panel.
 * Appears in the main Settings page.
 */
import { ref } from 'vue'
import type { AiConfig } from './composables/types'

const config = ref<AiConfig>({
  enabled: false,
  inferenceUrl: 'http://localhost:8001',
  model: 'qwen2.5:7b',
  autoScan: false,
})

function toggle() {
  config.value.enabled = !config.value.enabled
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <div>
        <p class="font-medium">AI 解码器</p>
        <p class="text-sm text-muted-foreground">
          阅读时识别代指/别名并提供解释
        </p>
      </div>
      <button
        class="rounded-md px-3 py-1.5 text-sm"
        :class="config.enabled ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'"
        @click="toggle"
      >
        {{ config.enabled ? '已启用' : '已关闭' }}
      </button>
    </div>

    <template v-if="config.enabled">
      <div class="space-y-1.5">
        <label class="text-sm font-medium">推理服务地址</label>
        <input
          v-model="config.inferenceUrl"
          type="text"
          class="w-full rounded-md border px-3 py-1.5 text-sm"
        />
      </div>

      <div class="space-y-1.5">
        <label class="text-sm font-medium">模型</label>
        <select
          v-model="config.model"
          class="w-full rounded-md border px-3 py-1.5 text-sm"
        >
          <option value="qwen2.5:7b">Qwen 2.5 7B</option>
          <option value="deepseek-r1:7b">DeepSeek R1 7B</option>
          <option value="llama3.1:8b">Llama 3.1 8B</option>
        </select>
      </div>

      <label class="flex items-center gap-2 text-sm">
        <input type="checkbox" v-model="config.autoScan" />
        新章节获取后自动扫描
      </label>
    </template>
  </div>
</template>
