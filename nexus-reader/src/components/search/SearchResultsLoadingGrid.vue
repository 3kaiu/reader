<script setup lang="ts">
import { Skeleton } from "@/components/ui";

defineProps<{
  count?: number;
}>();
</script>

<template>
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-20">
    <div
      v-for="i in count ?? 8"
      :key="i"
      class="flex h-32 rounded-2xl border border-border/30 bg-card p-0 overflow-hidden"
    >
      <div class="w-24 shrink-0">
        <Skeleton width="100%" height="100%" />
      </div>
      <div class="flex-1 p-3 space-y-3">
        <Skeleton width="80%" height="16px" class-name="rounded" />
        <Skeleton width="50%" height="12px" class-name="rounded" />
        <div class="pt-2">
          <Skeleton width="100%" height="32px" class-name="rounded-md" />
        </div>
      </div>
    </div>
  </div>
</template>
