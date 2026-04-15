<script setup lang="ts">
import { Database, Download, HardDrive, Trash2 } from 'lucide-vue-next'
import { formatBytes, type BrowserStorageEstimate } from '@/utils/browserStorage'

defineProps<{
  storageUsage: BrowserStorageEstimate | null
}>()

const emit = defineEmits<{
  exportData: []
  clearCache: []
}>()
</script>

<template>
  <section class="mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100">
    <div class="flex items-center gap-2 mb-4 px-1">
      <Database class="w-4 h-4 text-primary" />
      <h2 class="text-sm font-bold text-muted-foreground uppercase tracking-wider">数据管理</h2>
    </div>
    <div class="space-y-3">
      <div
        class="group rounded-2xl border border-border/50 bg-card hover:bg-muted/30 cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] overflow-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        @click="emit('exportData')"
        role="button"
        tabindex="0"
        @keydown.enter="emit('exportData')"
        @keydown.space.prevent="emit('exportData')"
        aria-label="导出数据备份"
      >
        <div class="p-5 flex items-center gap-4">
          <div
            class="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors"
          >
            <Download class="h-6 w-6" />
          </div>
          <div class="flex-1 min-w-0">
            <h3 class="font-semibold text-base mb-1">导出数据备份</h3>
            <p class="text-xs text-muted-foreground line-clamp-1">
              备份书源、分组、替换规则等配置数据
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200">
    <div class="flex items-center gap-2 mb-4 px-1">
      <HardDrive class="w-4 h-4 text-primary" />
      <h2 class="text-sm font-bold text-muted-foreground uppercase tracking-wider">存储管理</h2>
    </div>
    <div class="space-y-3">
      <div v-if="storageUsage" class="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div class="p-5">
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-3">
              <div
                class="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center"
              >
                <HardDrive class="h-5 w-5" />
              </div>
              <div>
                <p class="text-sm font-medium">存储使用</p>
                <p class="text-xs text-muted-foreground mt-0.5">
                  {{ formatBytes(storageUsage.used) }} /
                  {{ formatBytes(storageUsage.quota) }}
                </p>
              </div>
            </div>
          </div>
          <div class="w-full bg-muted rounded-full h-2 overflow-hidden">
            <div
              class="bg-primary h-2 rounded-full transition-all duration-300"
              :style="{
                width: `${Math.min((storageUsage.used / storageUsage.quota) * 100, 100)}%`,
              }"
            />
          </div>
        </div>
      </div>

      <div
        class="group rounded-2xl border border-destructive/30 bg-card hover:bg-destructive/5 cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] overflow-hidden focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2"
        @click="emit('clearCache')"
        role="button"
        tabindex="0"
        @keydown.enter="emit('clearCache')"
        @keydown.space.prevent="emit('clearCache')"
        aria-label="清除应用缓存"
      >
        <div class="p-5 flex items-center gap-4">
          <div
            class="w-12 h-12 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center shrink-0 group-hover:bg-destructive/20 transition-colors"
          >
            <Trash2 class="h-6 w-6" />
          </div>
          <div class="flex-1 min-w-0">
            <h3 class="font-semibold text-base text-destructive mb-1">清除应用缓存</h3>
            <p class="text-xs text-muted-foreground line-clamp-1">
              清除所有本地缓存和设置（不会删除服务器数据）
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
