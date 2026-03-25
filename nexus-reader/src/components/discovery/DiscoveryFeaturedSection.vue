<script setup lang="ts">
import { Sparkles } from "lucide-vue-next";
import { LazyImage } from "@/components/ui";
import type { DiscoveryItem } from "@/types/discovery";

defineProps<{
  items: DiscoveryItem[];
}>();

const emit = defineEmits<{
  open: [item: DiscoveryItem];
}>();
</script>

<template>
  <section v-if="items.length" class="space-y-4">
    <div class="flex items-center justify-between">
      <h3 class="flex items-center gap-2 text-xl font-bold tracking-tight">
        <Sparkles class="h-5 w-5 text-yellow-500" />
        本周力荐
      </h3>
    </div>
    <div
      class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6"
    >
      <div
        v-for="book in items"
        :key="book.bookId"
        class="group cursor-pointer space-y-3"
        @click="emit('open', book)"
      >
        <div
          class="relative aspect-[3/4] rounded-2xl overflow-hidden shadow-md group-hover:shadow-xl group-hover:-translate-y-1 transition-all duration-300"
        >
          <LazyImage
            v-if="book.coverUrl"
            :src="book.coverUrl"
            :alt="book.name"
            aspect-ratio="3/4"
            class="w-full h-full transition-transform duration-500 group-hover:scale-105"
          />
          <div
            class="absolute inset-0 bg-black/5 group-hover:bg-black/0 transition-colors"
          />
          <div class="absolute top-2 left-2">
            <div
              class="bg-black/60 backdrop-blur-md text-white text-[10px] px-2 py-1 rounded-lg font-bold"
            >
              No.{{ book.position }}
            </div>
          </div>
        </div>
        <div class="space-y-1">
          <h4 class="font-bold text-sm line-clamp-1 group-hover:text-primary transition-colors">
            {{ book.name }}
          </h4>
          <p v-if="book.author" class="text-xs text-muted-foreground/70">
            {{ book.author }}
          </p>
        </div>
      </div>
    </div>
  </section>
</template>
