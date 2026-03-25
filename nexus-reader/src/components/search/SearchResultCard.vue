<script setup lang="ts">
import { BookMarked, Check, Loader2 } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { LazyImage } from "@/components/ui";
import type { SearchResult } from "@/types/search";

defineProps<{
  book: SearchResult;
  openingBook: string | null;
  isOnShelf: boolean;
}>();

const emit = defineEmits<{
  open: [book: SearchResult];
  addToShelf: [book: SearchResult];
}>();
</script>

<template>
  <div
    class="group relative flex bg-card rounded-2xl border border-border/40 hover:border-border hover:shadow-md cursor-pointer overflow-hidden transition-all duration-200 ease-out hover:bg-muted/30 active:scale-[0.98]"
    @click="emit('open', book)"
  >
    <div class="relative w-24 shrink-0 bg-muted">
      <LazyImage
        v-if="book.coverUrl"
        :src="book.coverUrl"
        class="w-full h-full object-cover"
      />
      <div
        v-else
        class="w-full h-full flex items-center justify-center text-muted-foreground/20 bg-secondary"
      >
        <BookMarked class="h-8 w-8" />
      </div>
    </div>

    <div class="flex-1 p-3 flex flex-col min-w-0">
      <h3
        class="font-medium text-sm text-foreground line-clamp-2 leading-snug group-hover:text-primary transition-colors mb-1"
      >
        {{ book.name }}
      </h3>

      <div class="flex items-center gap-1.5 mb-2">
        <span class="text-xs text-muted-foreground truncate">{{
          book.author || "未知作者"
        }}</span>
        <span class="text-xs text-muted-foreground/30">•</span>
        <span class="text-[10px] text-muted-foreground/70 truncate max-w-24">{{
          book.sourceName
        }}</span>
      </div>

      <div class="flex-1 relative mb-2">
        <p
          v-if="book.intro"
          class="text-xs text-muted-foreground/60 line-clamp-2 leading-relaxed"
        >
          {{ book.intro.trim() }}
        </p>
        <p
          v-else-if="book.latestChapterTitle"
          class="text-[10px] text-muted-foreground/50 truncate"
        >
          {{ book.latestChapterTitle }}
        </p>
      </div>

      <div class="flex items-center justify-end">
        <Button
          size="sm"
          variant="ghost"
          class="h-7 px-3 text-xs rounded-md hover:bg-secondary"
          :class="isOnShelf ? 'text-green-600' : 'text-muted-foreground'"
          @click.stop="emit('addToShelf', book)"
        >
          <Check v-if="isOnShelf" class="h-3 w-3 mr-1" />
          <span v-else class="mr-1 text-[10px]">+</span>
          {{ isOnShelf ? "已添加" : "收藏" }}
        </Button>
      </div>
    </div>

    <div
      v-if="openingBook === book.bookUrl"
      class="absolute inset-0 bg-background/80 backdrop-blur-sm z-30 flex items-center justify-center"
    >
      <Loader2 class="h-5 w-5 animate-spin text-primary" />
    </div>
  </div>
</template>
