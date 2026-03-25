<script setup lang="ts">
import type { Component } from "vue";
import { Download, Loader2 } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ModelInfo } from "@/types/ai";

defineProps<{
  models: ModelInfo[];
  currentModel: string | null;
  isLoading: boolean;
  downloadingModel: string | null;
  getModelSeriesIcon: (modelId: string) => Component;
}>();

const emit = defineEmits<{
  download: [modelId: string];
  unload: [];
}>();
</script>

<template>
  <div class="space-y-4">
    <div class="px-1 space-y-1">
      <h2 class="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        可用模型
      </h2>
      <p class="text-[10px] text-muted-foreground/60">
        来自前端内置模型清单，按本地浏览器运行时加载
      </p>
    </div>

    <div class="grid gap-3">
      <div
        v-for="model in models"
        :key="model.id"
        class="group relative bg-card hover:bg-muted/40 rounded-xl border border-border/40 hover:border-border transition-all duration-200 overflow-hidden"
        :class="currentModel === model.id ? 'ring-1 ring-primary/20 bg-primary/5' : ''"
      >
        <div class="p-4 flex items-center gap-4">
          <div
            class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-colors"
            :class="
              currentModel === model.id
                ? 'bg-primary/20 text-primary'
                : 'bg-muted text-muted-foreground/60'
            "
          >
            <component :is="getModelSeriesIcon(model.id)" class="h-5 w-5" />
          </div>

          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <h3 class="text-sm font-medium text-foreground truncate">
                {{ model.name }}
              </h3>
              <Badge
                v-if="currentModel === model.id"
                variant="secondary"
                class="bg-primary/10 text-primary h-5 px-1.5 text-[10px] font-normal rounded"
              >
                当前使用
              </Badge>
            </div>
            <div class="flex items-center gap-3 text-xs text-muted-foreground/60 font-mono">
              <span>{{ model.params }}</span>
              <span class="w-px h-2.5 bg-border/60"></span>
              <span>{{ model.quantization }}</span>
              <span class="w-px h-2.5 bg-border/60"></span>
              <span>{{ model.size }}</span>
            </div>
          </div>

          <div class="shrink-0">
            <Button
              v-if="currentModel !== model.id"
              variant="outline"
              size="sm"
              class="h-8 px-3 text-xs font-medium rounded-lg hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors"
              :disabled="isLoading"
              @click="emit('download', model.id)"
            >
              <Download
                v-if="downloadingModel !== model.id"
                class="h-3.5 w-3.5 mr-1.5"
              />
              <Loader2 v-else class="h-3.5 w-3.5 mr-1.5 animate-spin" />
              {{ downloadingModel === model.id ? "加载中" : "加载" }}
            </Button>

            <Button
              v-else
              variant="ghost"
              size="sm"
              class="h-8 px-3 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg"
              @click="emit('unload')"
            >
              卸载
            </Button>
          </div>
        </div>
      </div>

      <div v-if="models.length === 0" class="py-12 text-center">
        <p class="text-sm text-muted-foreground">未找到可用模型</p>
      </div>
    </div>
  </div>
</template>
