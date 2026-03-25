<script setup lang="ts">
import { ArrowRight, BookOpen, Sparkles, Trophy, Users } from "lucide-vue-next";
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
  <section v-if="items.length" class="space-y-6">
    <div class="flex items-center justify-between">
      <h3 class="flex items-center gap-2 text-xl font-bold tracking-tight">
        <Trophy class="h-5 w-5 text-orange-500" />
        历史风云榜
      </h3>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div
        v-for="book in items"
        :key="book.bookId"
        class="group flex items-center gap-4 p-4 rounded-3xl bg-muted/30 border border-transparent hover:border-primary/20 hover:bg-muted/50 transition-all duration-300 cursor-pointer"
        @click="emit('open', book)"
      >
        <div class="relative shrink-0 w-16 h-20 rounded-xl overflow-hidden shadow-sm">
          <LazyImage
            v-if="book.coverUrl"
            :src="book.coverUrl"
            :alt="book.name"
            aspect-ratio="4/5"
            class="w-full h-full"
          />
          <div
            v-else
            class="w-full h-full bg-muted flex items-center justify-center"
          >
            <BookOpen class="h-6 w-6 text-muted-foreground/30" />
          </div>
        </div>
        <div class="flex-1 min-w-0 space-y-1.5">
          <div class="flex items-center gap-2">
            <span
              class="text-lg font-black italic opacity-20 group-hover:opacity-40 transition-opacity"
            >
              #{{ book.position }}
            </span>
            <h4 class="font-bold text-base truncate group-hover:text-primary transition-colors">
              {{ book.name || "未知书名" }}
            </h4>
          </div>
          <div class="flex items-center gap-3 text-xs text-muted-foreground">
            <span v-if="book.author" class="flex items-center gap-1">
              <Users class="h-3 w-3" />
              {{ book.author }}
            </span>
            <span
              v-if="book.followers"
              class="flex items-center gap-1 text-primary/80 font-medium"
            >
              <Sparkles class="h-3 w-3" />
              {{ (book.followers / 10000).toFixed(1) }}万关注
            </span>
          </div>
        </div>
        <ArrowRight
          class="h-5 w-5 text-muted-foreground/30 group-hover:text-primary group-hover:translate-x-1 transition-all"
        />
      </div>
    </div>
  </section>
</template>
