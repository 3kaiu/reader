<script setup lang="ts">
import { Skeleton } from "@/components/ui";
</script>

<template>
  <div class="space-y-12">
    <div class="flex gap-4 overflow-hidden">
      <Skeleton
        v-for="i in 2"
        :key="i"
        width="85vw"
        height="48vw"
        class-name="rounded-3xl shrink-0 sm:w-[60vw]"
      />
    </div>

    <div class="space-y-4">
      <Skeleton width="120px" height="28px" />
      <div
        class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6"
      >
        <div v-for="i in 6" :key="i" class="space-y-3">
          <Skeleton
            width="100%"
            aspect-ratio="3/4"
            class-name="rounded-2xl"
          />
          <div class="space-y-2">
            <Skeleton width="80%" height="16px" />
            <Skeleton width="40%" height="12px" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
