<script setup lang="ts">
import { Brain } from "lucide-vue-next";
import { ADDON_FEATURE_TOGGLES, type AddonRouteEntry } from "@/constants/addons";
import { Switch } from "@/components/ui/switch";
import type { OptionalFeature } from "@/utils/features";

defineProps<{
  addonFeatures: Record<string, boolean>;
  addonEntryCards: AddonRouteEntry[];
}>();

const emit = defineEmits<{
  updateAddonFeature: [feature: OptionalFeature, enabled: boolean];
  navigate: [path: string];
}>();
</script>

<template>
  <section class="mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
    <div class="flex items-center gap-2 mb-4 px-1">
      <Brain class="w-4 h-4 text-primary" />
      <h2 class="text-sm font-bold text-muted-foreground uppercase tracking-wider">
        附属功能
      </h2>
    </div>

    <div class="space-y-3 mb-4">
      <div
        v-for="item in ADDON_FEATURE_TOGGLES"
        :key="item.key"
        class="rounded-2xl border border-border/50 bg-card overflow-hidden"
      >
        <div class="p-5 flex items-center justify-between gap-4">
          <div class="flex items-center gap-4 min-w-0">
            <div
              class="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
              :class="[item.bg, item.color]"
            >
              <component :is="item.icon" class="h-6 w-6" />
            </div>
            <div class="min-w-0">
              <h3 class="font-semibold text-base mb-1">{{ item.label }}</h3>
              <p class="text-xs text-muted-foreground">
                {{ item.description }}
              </p>
            </div>
          </div>
          <Switch
            :checked="addonFeatures[item.key]"
            @update:checked="(value: boolean) => emit('updateAddonFeature', item.key, value)"
          />
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div
        v-for="item in addonEntryCards"
        :key="item.path"
        class="group rounded-2xl border border-border/50 bg-card hover:bg-muted/30 cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] overflow-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        @click="emit('navigate', item.path)"
        role="button"
        tabindex="0"
        @keydown.enter="emit('navigate', item.path)"
        @keydown.space.prevent="emit('navigate', item.path)"
        :aria-label="item.label"
      >
        <div class="p-5 flex items-center gap-4">
          <div
            class="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-colors"
            :class="[item.bg, item.color]"
          >
            <component :is="item.icon" class="h-6 w-6" />
          </div>
          <div class="flex-1 min-w-0">
            <h3 class="font-semibold text-base mb-1">{{ item.label }}</h3>
            <p class="text-xs text-muted-foreground line-clamp-1">
              {{ item.description }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
