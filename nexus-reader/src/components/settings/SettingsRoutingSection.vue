<script setup lang="ts">
import { Info } from "lucide-vue-next";

type RouteStat = {
  key: string;
  label: string;
  shareLabel: string;
  p50Label: string;
  p95Label: string;
};

type ClientRoutingSummary = {
  window: string;
  note: string;
  routes: RouteStat[];
};

defineProps<{
  clientRoutingLoading: boolean;
  clientRoutingSummary: ClientRoutingSummary;
}>();

const emit = defineEmits<{
  refresh: [];
}>();
</script>

<template>
  <section class="mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-250">
    <div class="flex items-center gap-2 mb-4 px-1">
      <Info class="w-4 h-4 text-primary" />
      <h2 class="text-sm font-bold text-muted-foreground uppercase tracking-wider">
        网络路径 / 直连效果
      </h2>
      <span v-if="clientRoutingSummary.window" class="text-xs text-muted-foreground/70 ml-auto">
        窗口：{{ clientRoutingSummary.window }}
      </span>
    </div>

    <div class="rounded-2xl border border-border/50 bg-card overflow-hidden">
      <div class="p-5 flex items-start justify-between gap-3">
        <div class="space-y-1">
          <p class="text-sm font-medium">路由占比</p>
          <p class="text-xs text-muted-foreground">direct / edge</p>
        </div>
        <button
          class="h-8 px-3 text-xs rounded-full border bg-background hover:bg-muted transition-colors"
          :disabled="clientRoutingLoading"
          @click="emit('refresh')"
        >
          {{ clientRoutingLoading ? "刷新中..." : "刷新" }}
        </button>
      </div>

      <div class="px-5 pb-5 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div
          v-for="routeStat in clientRoutingSummary.routes"
          :key="routeStat.key"
          class="rounded-xl border border-border/50 bg-muted/20 p-4"
        >
          <p class="text-xs text-muted-foreground mb-1">{{ routeStat.label }}</p>
          <p class="text-lg font-semibold">{{ routeStat.shareLabel }}</p>
          <p class="text-xs text-muted-foreground mt-2">
            p50 {{ routeStat.p50Label }} · p95 {{ routeStat.p95Label }}
          </p>
        </div>
      </div>

      <div v-if="clientRoutingSummary.note" class="px-5 pb-5 text-xs text-muted-foreground/70">
        {{ clientRoutingSummary.note }}
      </div>
    </div>
  </section>
</template>
