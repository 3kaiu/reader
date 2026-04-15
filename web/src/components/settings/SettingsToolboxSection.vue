<script setup lang="ts">
import { Brain, Wand2, Wrench } from 'lucide-vue-next'
import type { AddonRouteEntry } from '@/constants/addons'

type ToolboxEntry = {
  label: string
  description: string
  path: string
  icon: typeof Brain
  color: string
  bg: string
}

const props = defineProps<{
  toolboxMode: boolean
  addonEntryCards: AddonRouteEntry[]
}>()

const emit = defineEmits<{
  toggleToolboxMode: [enabled: boolean]
  navigate: [path: string]
}>()

const staticEntries: ToolboxEntry[] = [
  {
    label: '替换规则',
    description: '正文净化和规则替换',
    path: '/replace-rule',
    icon: Wand2,
    color: 'text-purple-500',
    bg: 'bg-purple-500/10',
  },
  {
    label: '书源工厂',
    description: '封装样本并自动验证修正',
    path: '/source-builder-debug',
    icon: Wrench,
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
  },
]
</script>

<template>
  <section class="mb-8">
    <div class="rounded-2xl border border-border/50 bg-card p-5">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-sm font-semibold">个人工具箱</p>
          <p class="text-xs text-muted-foreground mt-1">
            默认隐藏高级治理与调试入口，按需展开，不打断日常阅读设置。
          </p>
        </div>
        <button
          class="h-8 px-3 rounded-full border bg-background hover:bg-muted text-xs"
          @click="emit('toggleToolboxMode', !props.toolboxMode)"
        >
          {{ props.toolboxMode ? '隐藏工具箱' : '显示工具箱' }}
        </button>
      </div>
    </div>

    <div v-if="props.toolboxMode" class="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
      <div
        v-for="item in staticEntries"
        :key="item.path"
        class="group rounded-2xl border border-border/50 bg-card hover:bg-muted/30 cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] overflow-hidden"
        @click="emit('navigate', item.path)"
      >
        <div class="p-5 flex items-center gap-4">
          <div
            class="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-colors"
            :class="[item.bg, item.color]"
          >
            <component :is="item.icon" class="h-6 w-6" />
          </div>
          <div class="flex-1 min-w-0">
            <h3 class="font-semibold text-base mb-1">{{ item.label }}</h3>
            <p class="text-xs text-muted-foreground line-clamp-1">
              {{ item.description }}
            </p>
          </div>
        </div>
      </div>

      <div
        v-for="item in props.addonEntryCards"
        :key="item.path"
        class="group rounded-2xl border border-border/50 bg-card hover:bg-muted/30 cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] overflow-hidden"
        @click="emit('navigate', item.path)"
      >
        <div class="p-5 flex items-center gap-4">
          <div
            class="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-colors"
            :class="[item.bg, item.color]"
          >
            <component :is="item.icon" class="h-6 w-6" />
          </div>
          <div class="flex-1 min-w-0">
            <h3 class="font-semibold text-base mb-1">{{ item.label }}</h3>
            <p class="text-xs text-muted-foreground line-clamp-1">
              {{ item.description }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
