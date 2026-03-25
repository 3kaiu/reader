<script setup lang="ts">
import { AlertCircle, Check, Loader2 } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import type { RuntimeLoadingStep } from "@/stores/ai/store/types";

defineProps<{
  isSupported: boolean;
  isLoading: boolean;
  isModelLoaded: boolean;
  loadingTitle: string;
  loadStatus: string;
  loadProgress: number;
  loadingSteps: RuntimeLoadingStep[];
  error: string | null;
  currentModel: string | null;
}>();

const emit = defineEmits<{
  retry: [];
  dismissError: [];
}>();
</script>

<template>
  <div
    v-if="!isSupported"
    class="p-4 rounded-xl bg-destructive/5 border border-destructive/20 text-destructive flex gap-3 text-sm animate-in fade-in slide-in-from-top-2"
  >
    <AlertCircle class="h-5 w-5 shrink-0" />
    <div>
      <p class="font-medium">WebGPU 不受支持</p>
      <p class="opacity-80 mt-0.5 text-xs">
        请使用 Chrome 113+、Edge 113+ 或 Safari 17+ 浏览器。
      </p>
    </div>
  </div>

  <div
    v-if="isLoading"
    class="bg-card rounded-xl border border-border/50 p-4 animate-in fade-in zoom-in-95"
  >
    <div class="flex items-center gap-3 mb-3">
      <Loader2 class="h-5 w-5 text-primary animate-spin" />
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium">{{ loadingTitle }}</p>
        <p class="text-xs text-muted-foreground truncate">
          {{ loadStatus }}
        </p>
      </div>
      <span class="text-xs font-mono font-medium">{{ loadProgress }}%</span>
    </div>
    <div class="h-1.5 bg-secondary rounded-full overflow-hidden">
      <div
        class="h-full bg-primary transition-all duration-300"
        :style="{ width: `${loadProgress}%` }"
      />
    </div>

    <div class="flex items-center justify-between mt-3 text-xs text-muted-foreground">
      <div
        v-for="step in loadingSteps"
        :key="step.key"
        class="flex items-center gap-2"
      >
        <div
          class="w-2 h-2 rounded-full"
          :class="step.complete ? 'bg-primary' : 'bg-muted'"
        ></div>
        <span>{{ step.label }}</span>
      </div>
    </div>
  </div>

  <div
    v-if="!isLoading && isModelLoaded && !error"
    class="bg-green-50 dark:bg-green-950/20 rounded-xl border border-green-200 dark:border-green-800/30 p-4 animate-in fade-in slide-in-from-top-2"
  >
    <div class="flex items-center gap-3">
      <Check class="h-5 w-5 text-green-600 dark:text-green-400" />
      <div>
        <p class="text-sm font-medium text-green-800 dark:text-green-200">
          AI模型已就绪
        </p>
        <p class="text-xs text-green-600 dark:text-green-400 mt-0.5">
          {{ currentModel }} 已成功加载，可以开始使用AI功能
        </p>
      </div>
    </div>
  </div>

  <div
    v-if="error && !isLoading"
    class="bg-destructive/5 rounded-xl border border-destructive/20 p-4 animate-in fade-in slide-in-from-top-2"
  >
    <div class="flex items-start gap-3">
      <AlertCircle class="h-5 w-5 text-destructive shrink-0 mt-0.5" />
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium text-destructive">加载失败</p>
        <p class="text-xs text-destructive/80 mt-1">{{ error }}</p>
        <div class="flex gap-2 mt-3">
          <Button
            variant="outline"
            size="sm"
            class="h-7 px-3 text-xs border-destructive/30 hover:bg-destructive/10"
            @click="emit('retry')"
          >
            重试
          </Button>
          <Button
            variant="ghost"
            size="sm"
            class="h-7 px-3 text-xs text-muted-foreground hover:text-foreground"
            @click="emit('dismissError')"
          >
            忽略
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
