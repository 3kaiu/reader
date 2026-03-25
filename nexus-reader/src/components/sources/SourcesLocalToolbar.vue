<script setup lang="ts">
import { Server } from "lucide-vue-next";
import { PageToolbar } from "@/components/common";

defineProps<{
  activeGroup: string;
  filteredCount: number;
  enabledCount: number;
  totalCount: number;
  isManageMode: boolean;
}>();

const emit = defineEmits<{
  "toggle-manage": [];
}>();
</script>

<template>
  <PageToolbar
    :title="activeGroup === '全部' ? '全部书源' : activeGroup"
    :icon="Server"
    :count="filteredCount"
    :stats="[
      {
        label: '启用',
        value: enabledCount,
        color: '#22c55e',
      },
      {
        label: '/',
        value: totalCount - enabledCount,
      },
    ]"
    :is-manage-mode="isManageMode"
    @toggle-manage="emit('toggle-manage')"
  />
</template>
