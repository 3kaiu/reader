<script setup lang="ts">
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { BookshelfMenuGroup } from "@/constants/bookshelf";

defineProps<{
  open: boolean;
  isDesktop: boolean;
  menuGroups: BookshelfMenuGroup[];
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  navigate: [path: string];
}>();

function handleSheetNavigation(path: string) {
  emit("navigate", path);
  emit("update:open", false);
}
</script>

<template>
  <component
    :is="isDesktop ? DropdownMenu : Sheet"
    :open="open"
    @update:open="emit('update:open', $event)"
  >
    <component :is="isDesktop ? DropdownMenuTrigger : SheetTrigger" as-child>
      <slot />
    </component>

    <DropdownMenuContent
      v-if="isDesktop"
      align="end"
      :side-offset="8"
      class="w-72 p-2 rounded-xl border bg-popover/95 backdrop-blur-xl shadow-xl"
    >
      <div class="grid gap-1">
        <div v-for="(group, idx) in menuGroups" :key="idx">
          <div
            v-if="group.title"
            class="px-2 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider opacity-70"
          >
            {{ group.title }}
          </div>
          <DropdownMenuItem
            v-for="item in group.items"
            :key="item.path"
            @click="emit('navigate', item.path)"
            class="flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer focus:bg-accent focus:text-accent-foreground transition-colors group"
          >
            <div
              class="w-8 h-8 rounded-[8px] flex items-center justify-center shrink-0 transition-colors"
              :class="[item.bg, 'group-hover:bg-opacity-80']"
            >
              <component :is="item.icon" class="h-4 w-4" :class="item.color" />
            </div>
            <div class="flex flex-col gap-0.5 flex-1 min-w-0">
              <span class="text-[13px] font-medium text-foreground leading-none">
                {{ item.label }}
              </span>
              <span
                class="text-[11px] text-muted-foreground truncate leading-none opacity-80"
              >
                {{ item.desc }}
              </span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuSeparator
            v-if="idx < menuGroups.length - 1"
            class="my-1 opacity-50"
          />
        </div>
      </div>
    </DropdownMenuContent>

    <SheetContent
      v-else
      side="bottom"
      class="rounded-t-[20px] px-4 pb-8 pt-4 bg-background/95 backdrop-blur-xl border-t-0"
    >
      <div class="w-10 h-1 rounded-full bg-muted mx-auto mb-6 opacity-50" />
      <SheetHeader class="mb-6 text-left px-2">
        <SheetTitle class="text-lg font-bold">功能菜单</SheetTitle>
      </SheetHeader>

      <div class="grid gap-6">
        <div v-for="(group, idx) in menuGroups" :key="idx" class="space-y-3">
          <div
            v-if="group.title"
            class="px-2 text-[11px] font-bold text-muted-foreground uppercase tracking-wider"
          >
            {{ group.title }}
          </div>
          <div class="grid grid-cols-1 gap-2">
            <button
              v-for="item in group.items"
              :key="item.path"
              @click="handleSheetNavigation(item.path)"
              class="flex items-center gap-4 px-3 py-3 rounded-xl bg-secondary/30 active:scale-[0.98] transition-all border border-transparent active:border-primary/10"
            >
              <div
                class="w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0"
                :class="item.bg"
              >
                <component :is="item.icon" class="h-5 w-5" :class="item.color" />
              </div>
              <div class="flex flex-col gap-1 items-start flex-1 min-w-0">
                <span class="text-[15px] font-semibold text-foreground leading-none">
                  {{ item.label }}
                </span>
                <span class="text-[12px] text-muted-foreground truncate leading-none">
                  {{ item.desc }}
                </span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </SheetContent>
  </component>
</template>
