<script setup lang="ts">
import { Button } from "@/components/ui/button";
import type { SearchSourceOption } from "@/types/search";
import SearchQueryBar from "./SearchQueryBar.vue";
import SearchSourceFilters from "./SearchSourceFilters.vue";

defineProps<{
  searchKeyword: string;
  searchHistory: string[];
  loading: boolean;
  availableSources: SearchSourceOption[];
  selectedSources: Set<string>;
}>();

const emit = defineEmits<{
  (e: "update:searchKeyword", value: string): void;
  (e: "search", keyword?: string): void;
  (e: "clearHistory"): void;
  (e: "goBack"): void;
  (e: "stopSearch"): void;
  (e: "toggleSource", sourceId: string): void;
  (e: "clearSourceFilter"): void;
}>();
</script>

<template>
  <div
    class="min-h-screen flex flex-col items-center justify-center px-6 animate-in fade-in zoom-in-95 duration-500 pt-20"
  >
    <div class="w-full max-w-2xl flex flex-col items-center">
      <p
        class="text-muted-foreground text-center max-w-md text-sm sm:text-base leading-relaxed mb-10"
      >
        在搜索框输入书名或作者名称进行搜索
      </p>

      <div class="w-full max-w-xl mb-12">
        <SearchQueryBar
          variant="hero"
          :model-value="searchKeyword"
          :show-search-button="true"
          :show-stop-button="loading"
          :autofocus="true"
          @update:model-value="emit('update:searchKeyword', $event)"
          @search="emit('search')"
          @stop="emit('stopSearch')"
        />
      </div>

      <SearchSourceFilters
        v-if="availableSources.length > 1"
        :available-sources="availableSources"
        :selected-sources="selectedSources"
        :disabled="loading"
        @toggle-source="emit('toggleSource', $event)"
        @clear="emit('clearSourceFilter')"
      />

      <div
        v-if="searchHistory.length > 0"
        class="w-full max-w-xl animate-in slide-in-from-bottom-4 duration-500 delay-100"
      >
        <div class="flex items-center justify-between mb-4 px-1">
          <span class="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
            最近搜索
          </span>
          <button
            class="text-xs text-muted-foreground hover:text-destructive transition-colors px-2 py-1"
            @click="emit('clearHistory')"
          >
            清除
          </button>
        </div>
        <div class="flex flex-wrap gap-2 justify-center sm:justify-start">
          <button
            v-for="keyword in searchHistory.slice(0, 8)"
            :key="keyword"
            class="px-4 py-2 rounded-full bg-secondary hover:bg-secondary/80 text-sm text-foreground/80 hover:text-foreground transition-all active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 hover:shadow-sm"
            @click="emit('search', keyword)"
            :aria-label="`搜索 ${keyword}`"
          >
            {{ keyword }}
          </button>
        </div>
      </div>
      <div v-else class="text-center">
        <p class="text-sm text-muted-foreground/60">暂无搜索历史</p>
      </div>

      <div class="mt-12">
        <Button variant="ghost" @click="emit('goBack')"> 返回书架 </Button>
      </div>
    </div>
  </div>
</template>
