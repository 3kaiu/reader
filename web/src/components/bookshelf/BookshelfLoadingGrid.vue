<script setup lang="ts">
import { Skeleton, SceneLoader } from '@/components/ui'
</script>

<template>
  <div class="flex flex-col items-center py-16">
    <SceneLoader scene="bookshelf" :size="80" class="text-primary/30 mb-6" />
    <div class="w-full">
      <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4 sm:gap-6 opacity-30">
        <div v-for="i in 12" :key="i" class="space-y-3">
          <Skeleton width="100%" aspect-ratio="2/3" class-name="rounded-xl" />
          <div class="space-y-2">
            <Skeleton width="100%" height="14px" />
            <Skeleton width="60%" height="12px" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
