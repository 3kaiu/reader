<script setup lang="ts">
import { Plus, Wand2 } from "lucide-vue-next";
import {
  EmptyState,
  LoadingGrid,
  PageToolbar,
} from "@/components/common";
import type { ReplaceRule } from "@/types/replace";
import { getReplaceRuleKey } from "@/utils/replaceRules";
import ReplaceRuleCard from "./ReplaceRuleCard.vue";

type ReplaceRuleStats = {
  total: number;
  enabled: number;
  filtered: number;
  selected: number;
};

defineProps<{
  searchKeyword: string;
  loading: boolean;
  filteredRules: ReplaceRule[];
  isManageMode: boolean;
  stats: ReplaceRuleStats;
  isRuleSelected: (rule: ReplaceRule) => boolean;
}>();

const emit = defineEmits<{
  toggleManageMode: [];
  toggleSelect: [rule: ReplaceRule];
  openEdit: [rule?: ReplaceRule];
  deleteRule: [rule: ReplaceRule];
  toggleEnabled: [rule: ReplaceRule, enabled: boolean];
  resetSearch: [];
}>();
</script>

<template>
  <div class="space-y-6">
    <PageToolbar
      title="全部规则"
      :icon="Wand2"
      :count="stats.filtered"
      :stats="[
        {
          label: '启用',
          value: stats.enabled,
          color: '#22c55e',
        },
        {
          label: '/',
          value: stats.total - stats.enabled,
        },
      ]"
      :is-manage-mode="isManageMode"
      @toggle-manage="emit('toggleManageMode')"
    />

    <LoadingGrid v-if="loading" />

    <EmptyState
      v-else-if="filteredRules.length === 0"
      :icon="Wand2"
      :title="searchKeyword ? '未找到匹配的规则' : '暂无规则'"
      :description="
        searchKeyword
          ? '尝试更换搜索关键词'
          : '创建替换规则来优化阅读体验'
      "
      :actions="[
        {
          label: '新增规则',
          icon: Plus,
          onClick: () => emit('openEdit'),
        },
        ...(searchKeyword
          ? [
              {
                label: '查看全部',
                onClick: () => emit('resetSearch'),
                variant: 'outline' as const,
              },
            ]
          : []),
      ]"
    />

    <div
      v-else
      class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500"
    >
      <ReplaceRuleCard
        v-for="rule in filteredRules"
        :key="getReplaceRuleKey(rule)"
        :rule="rule"
        :is-manage-mode="isManageMode"
        :is-selected="isRuleSelected(rule)"
        @toggle-select="emit('toggleSelect', $event)"
        @open-edit="emit('openEdit', $event)"
        @delete-rule="emit('deleteRule', $event)"
        @toggle-enabled="
          (rule, enabled) => emit('toggleEnabled', rule, enabled)
        "
      />
    </div>
  </div>
</template>
