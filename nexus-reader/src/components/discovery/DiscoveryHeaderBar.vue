<script setup lang="ts">
import { Calendar, ChevronLeft, Sparkles } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type DiscoveryPeriodOption = {
  value: string;
  label: string;
  active: boolean;
};

defineProps<{
  hasData: boolean;
  currentPeriodLabel: string;
  currentPeriodButtonLabel: string;
  dateRangeLabel: string;
  periodOptions: DiscoveryPeriodOption[];
}>();

const emit = defineEmits<{
  back: [];
  changePeriod: [period: string];
}>();
</script>

<template>
  <header
    class="sticky top-0 z-40 w-full bg-background/80 backdrop-blur-xl border-b border-border/50"
  >
    <div class="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
      <div class="flex items-center gap-4">
        <Button variant="ghost" size="icon" class="rounded-full" @click="emit('back')">
          <ChevronLeft class="h-6 w-6" />
        </Button>
        <div class="flex flex-col">
          <h1 class="text-lg font-bold tracking-tight">探索发现</h1>
          <p
            v-if="hasData"
            class="text-[10px] text-muted-foreground font-medium uppercase tracking-widest opacity-70"
          >
            {{ currentPeriodLabel }} · {{ dateRangeLabel }}
          </p>
        </div>
      </div>

      <DropdownMenu v-if="periodOptions.length">
        <DropdownMenuTrigger as-child>
          <Button
            variant="outline"
            size="sm"
            class="rounded-full gap-2 border-primary/20 bg-primary/5 hover:bg-primary/10"
          >
            <Calendar class="h-4 w-4 text-primary" />
            <span class="text-xs font-semibold">{{ currentPeriodButtonLabel }}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          class="w-48 max-h-[16rem] overflow-y-auto rounded-xl shadow-2xl border-primary/10"
        >
          <DropdownMenuItem
            v-for="option in periodOptions"
            :key="option.value"
            @click="emit('changePeriod', option.value)"
            class="flex items-center justify-between py-2.5 px-3 cursor-pointer"
          :class="option.active ? 'bg-primary/10 text-primary font-bold' : ''"
          >
            <span class="text-sm">{{ option.label }}</span>
            <Sparkles v-if="option.active" class="h-3 w-3" />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </header>
</template>
