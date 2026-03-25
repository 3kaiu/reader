<script setup lang="ts">
import { HardDrive } from "lucide-vue-next";
import { Badge } from "@/components/ui/badge";
import { formatBytes, type BrowserStorageEstimate } from "@/utils/browserStorage";
import type { RuntimeCacheStats } from "@/stores/ai/store/types";

defineProps<{
  storageUsage: BrowserStorageEstimate | null;
  cacheStats: RuntimeCacheStats | null;
}>();
</script>

<template>
  <div v-if="storageUsage || cacheStats" class="space-y-3 pt-4 border-t border-border/40">
    <div
      v-if="cacheStats"
      class="bg-card rounded-xl border border-border/50 p-4"
    >
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2">
          <HardDrive class="h-4 w-4 text-muted-foreground" />
          <span class="text-sm font-medium">运行时缓存</span>
        </div>
        <Badge variant="secondary" class="text-xs">
          {{ cacheStats.modelCount }} 个模型
        </Badge>
      </div>

      <div class="space-y-2 text-xs text-muted-foreground">
        <div class="flex justify-between">
          <span>缓存大小:</span>
          <span class="font-mono">{{ formatBytes(cacheStats.totalSize) }}</span>
        </div>
        <div v-if="storageUsage" class="flex justify-between">
          <span>存储使用:</span>
          <span class="font-mono">
            {{ formatBytes(storageUsage.used) }} /
            {{ formatBytes(storageUsage.quota) }}
          </span>
        </div>
        <div class="flex justify-between">
          <span>加载方式:</span>
          <span class="text-green-600 dark:text-green-400">运行时动态加载</span>
        </div>
      </div>
    </div>

    <div
      v-else-if="storageUsage"
      class="flex items-center justify-between px-1 text-[10px] text-muted-foreground/50"
    >
      <div class="flex items-center gap-1.5">
        <HardDrive class="h-3 w-3" />
        <span>
          存储已用 {{ formatBytes(storageUsage.used) }} /
          {{ formatBytes(storageUsage.quota) }}
        </span>
      </div>
    </div>
  </div>
</template>
