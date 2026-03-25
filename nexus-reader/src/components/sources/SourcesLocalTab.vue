<script setup lang="ts">
import { X } from "lucide-vue-next";
import {
  LoadingGrid,
} from "@/components/common";
import type { SourceListItem } from "@/stores/source";
import SourcesLocalEmptyState from "./SourcesLocalEmptyState.vue";
import SourceListCard from "./SourceListCard.vue";
import SourcesLocalToolbar from "./SourcesLocalToolbar.vue";

type SourceStats = {
  total: number;
  enabled: number;
  filtered: number;
  selected: number;
};

defineProps<{
  searchKeyword: string;
  activeGroup: string;
  groups: [string, number][];
  loading: boolean;
  filteredSources: SourceListItem[];
  isManageMode: boolean;
  stats: SourceStats;
  isSourceSelected: (source: SourceListItem) => boolean;
}>();

const emit = defineEmits<{
  "update:activeGroup": [value: string];
  toggleManageMode: [];
  toggleSelect: [source: SourceListItem];
  openEdit: [source: SourceListItem];
  toggleEnable: [source: SourceListItem, enabled: boolean];
  deleteSource: [source: SourceListItem];
  deleteGroupSources: [groupName: string];
  openImport: [];
  resetFilters: [];
}>();
</script>

<template>
  <div class="space-y-6">
    <SourcesLocalToolbar
      :active-group="activeGroup"
      :filtered-count="stats.filtered"
      :enabled-count="stats.enabled"
      :total-count="stats.total"
      :is-manage-mode="isManageMode"
      @toggle-manage="emit('toggleManageMode')"
    />

    <div v-if="false" class="flex items-center gap-3 mb-6 -mt-4">
      <div class="flex-1"></div>
      <div class="flex-1 overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
        <div class="flex items-center gap-2 pb-2 sm:pb-0">
          <button
            v-for="[group, count] in groups.filter(([name]) => name !== '全部')"
            :key="group"
            class="relative px-3 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap snap-start select-none group/btn"
            :class="
              activeGroup === group
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            "
            @click="emit('update:activeGroup', group)"
          >
            {{ group }}
            <span class="ml-1 opacity-60 text-xs">{{ count }}</span>

            <button
              v-if="group !== '未分组' && activeGroup === group"
              class="absolute -top-1 -right-1 w-4 h-4 rounded-md bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover/btn:opacity-100 transition-opacity hover:scale-110"
              @click.stop="emit('deleteGroupSources', group)"
              aria-label="删除分组"
            >
              <X class="h-2.5 w-2.5" />
            </button>
          </button>
        </div>
      </div>
      <div class="flex-1"></div>
    </div>

    <LoadingGrid v-if="loading" />

    <SourcesLocalEmptyState
      v-else-if="filteredSources.length === 0"
      :search-keyword="searchKeyword"
      :active-group="activeGroup"
      @open-import="emit('openImport')"
      @reset-filters="emit('resetFilters')"
    />

    <div
      v-else
      class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500"
    >
      <SourceListCard
        v-for="source in filteredSources"
        :key="source.id"
        :source="source"
        :is-manage-mode="isManageMode"
        :is-selected="isSourceSelected(source)"
        @toggle-select="emit('toggleSelect', $event)"
        @open-edit="emit('openEdit', $event)"
        @toggle-enable="
          (source, enabled) => emit('toggleEnable', source, enabled)
        "
        @delete-source="emit('deleteSource', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.scrollbar-hide {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
</style>
