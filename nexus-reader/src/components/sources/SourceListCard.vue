<script setup lang="ts">
import {
  Circle,
  CheckCircle2,
  Globe2,
  Edit2,
  Trash2,
} from "lucide-vue-next";
import { Switch } from "@/components/ui/switch";
import type { SourceListItem } from "@/stores/source";

defineProps<{
  source: SourceListItem;
  isManageMode: boolean;
  isSelected: boolean;
}>();

const emit = defineEmits<{
  toggleSelect: [source: SourceListItem];
  openEdit: [source: SourceListItem];
  toggleEnable: [source: SourceListItem, enabled: boolean];
  deleteSource: [source: SourceListItem];
}>();
</script>

<template>
  <div
    class="group relative bg-card hover:bg-muted/50 rounded-xl border border-transparent transition-all duration-200 cursor-pointer overflow-hidden"
    :class="{
      'bg-muted/20': isSelected && isManageMode,
      'border-border/40 hover:border-border hover:shadow-sm': !isManageMode || !isSelected,
      'opacity-60': source.enabled === false && !isManageMode,
    }"
    @click="isManageMode ? emit('toggleSelect', source) : emit('openEdit', source)"
  >
    <div class="px-3 py-3 flex items-center gap-3">
      <div class="shrink-0 flex items-center justify-center">
        <div
          v-if="isManageMode"
          class="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
          :class="isSelected ? 'text-primary' : 'text-muted-foreground/30'"
        >
          <CheckCircle2 v-if="isSelected" class="w-5 h-5 fill-primary/10" />
          <Circle v-else class="w-5 h-5" />
        </div>
        <div
          v-else
          class="w-8 h-8 rounded-lg bg-primary/5 text-primary flex items-center justify-center"
          :class="{ 'grayscale opacity-50': !source.enabled }"
        >
          <Globe2 class="h-4 w-4" />
        </div>
      </div>

      <div class="flex-1 min-w-0 flex flex-col justify-center">
        <h3 class="text-sm font-medium leading-none mb-1.5 truncate pr-2">
          {{ source.name }}
        </h3>
        <p class="text-[10px] text-muted-foreground/50 font-mono truncate">
          {{ source.url.replace(/https?:\/\//, "").replace(/\/$/, "") }}
        </p>
      </div>

      <div class="shrink-0 flex items-center h-full">
        <template v-if="!isManageMode">
          <div class="group-hover:hidden flex items-center">
            <Switch
              :checked="source.enabled"
              @update:checked="(value: boolean) => emit('toggleEnable', source, value)"
              @click.stop
              class="scale-75 origin-right data-[state=checked]:bg-primary"
            />
          </div>

          <div class="hidden group-hover:flex items-center gap-1 -mr-1">
            <button
              class="w-7 h-7 rounded-md hover:bg-background border border-transparent hover:border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-all"
              @click.stop="emit('openEdit', source)"
              title="查看详情"
            >
              <Edit2 class="h-3.5 w-3.5" />
            </button>
            <button
              class="w-7 h-7 rounded-md hover:bg-destructive hover:text-destructive-foreground hover:border-transparent border border-transparent flex items-center justify-center text-muted-foreground transition-all"
              @click.stop="emit('deleteSource', source)"
              title="删除"
            >
              <Trash2 class="h-3.5 w-3.5" />
            </button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
