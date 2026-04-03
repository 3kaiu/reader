<script setup lang="ts">
import {
  Circle,
  CheckCircle2,
  Globe2,
  Edit2,
  Trash2,
} from "lucide-vue-next";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import type { SourceListItem } from "@/stores/source";

const props = defineProps<{
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

function getLicenseLabel(source: SourceListItem): string {
  switch (source.policy?.licenseStatus) {
    case "licensed":
      return "已授权";
    case "public_domain":
      return "公版";
    case "restricted":
      return "受限";
    case "blocked":
      return "已封禁";
    default:
      return "待审核";
  }
}

function getLicenseVariant(
  source: SourceListItem,
): "default" | "secondary" | "outline" | "destructive" {
  switch (source.policy?.licenseStatus) {
    case "licensed":
    case "public_domain":
      return "default";
    case "restricted":
      return "secondary";
    case "blocked":
      return "destructive";
    default:
      return "outline";
  }
}

function getHealthLabel(source: SourceListItem): string {
  if (!source.health) {
    return "健康度待采样";
  }

  const score = Math.round(source.health.score * 100);
  const latency = source.health.avgLatencyMs;
  const parts = [`健康度 ${score}`, `${latency}ms`];

  if (typeof source.health.healthPoints === "number") {
    parts.push(`积分=${source.health.healthPoints}`);
  }

  if (source.health.circuitState && source.health.circuitState !== "closed") {
    parts.push(`熔断=${source.health.circuitState}`);
  }
  if (source.health.primaryFailure && source.health.primaryFailure !== "none") {
    parts.push(`失败=${source.health.primaryFailure}`);
  }
  if (
    typeof source.health.consecutiveFailures === "number" &&
    source.health.consecutiveFailures > 0
  ) {
    parts.push(`连败=${source.health.consecutiveFailures}`);
  }
  if (Array.isArray(source.health.strategyChain) && source.health.strategyChain.length > 0) {
    parts.push(`链路=${source.health.strategyChain[0]}`);
  }
  if (
    source.health.restoredFromSnapshot &&
    typeof source.health.snapshotUpdatedAtMs === "number" &&
    source.health.snapshotUpdatedAtMs > 0
  ) {
    parts.push(`快照=${new Date(source.health.snapshotUpdatedAtMs).toLocaleString()}`);
  }
  if (
    typeof source.health.healthEventsSinceSnapshot === "number" &&
    source.health.healthEventsSinceSnapshot > 0
  ) {
    parts.push(`新增=${source.health.healthEventsSinceSnapshot}`);
  }

  return parts.join(" · ");
}
</script>

<template>
  <div
    class="group relative bg-card hover:bg-muted/50 rounded-xl border border-transparent transition-all duration-200 cursor-pointer overflow-hidden"
    :class="{
      'bg-muted/20': props.isSelected && props.isManageMode,
      'border-border/40 hover:border-border hover:shadow-sm': !props.isManageMode || !props.isSelected,
      'opacity-60': props.source.enabled === false && !props.isManageMode,
    }"
    @click="props.isManageMode ? emit('toggleSelect', props.source) : emit('openEdit', props.source)"
  >
    <div class="px-3 py-3 flex items-center gap-3">
      <div class="shrink-0 flex items-center justify-center">
        <div
          v-if="props.isManageMode"
          class="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
          :class="props.isSelected ? 'text-primary' : 'text-muted-foreground/30'"
        >
          <CheckCircle2 v-if="props.isSelected" class="w-5 h-5 fill-primary/10" />
          <Circle v-else class="w-5 h-5" />
        </div>
        <div
          v-else
          class="w-8 h-8 rounded-lg bg-primary/5 text-primary flex items-center justify-center"
          :class="{ 'grayscale opacity-50': !props.source.enabled }"
        >
          <Globe2 class="h-4 w-4" />
        </div>
      </div>

      <div class="flex-1 min-w-0 flex flex-col justify-center">
        <h3 class="text-sm font-medium leading-none mb-1.5 truncate pr-2">
          {{ props.source.name }}
        </h3>
        <p class="text-[10px] text-muted-foreground/50 font-mono truncate">
          {{ props.source.url.replace(/https?:\/\//, "").replace(/\/$/, "") }}
        </p>
        <div class="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge
            :variant="getLicenseVariant(props.source)"
            class="px-1.5 py-0 text-[10px]"
          >
            {{ getLicenseLabel(props.source) }}
          </Badge>
          <Badge
            v-if="!props.source.enabled"
            variant="outline"
            class="px-1.5 py-0 text-[10px]"
          >
            已停用
          </Badge>
          <Badge
            v-else-if="props.source.publicAccessEnabled"
            variant="secondary"
            class="px-1.5 py-0 text-[10px]"
          >
            可公开接入
          </Badge>
          <Badge
            v-if="props.source.health?.lowConfidence"
            variant="outline"
            class="px-1.5 py-0 text-[10px] border-amber-500/30 text-amber-700 dark:text-amber-300"
          >
            低置信度
          </Badge>
        </div>
        <p class="mt-2 text-[10px] text-muted-foreground/70 truncate">
          {{ getHealthLabel(props.source) }}
        </p>
      </div>

      <div class="shrink-0 flex items-center h-full">
        <template v-if="!props.isManageMode">
          <div class="group-hover:hidden flex items-center">
            <Switch
              :checked="props.source.enabled"
              @update:checked="(value: boolean) => emit('toggleEnable', props.source, value)"
              @click.stop
              class="scale-75 origin-right data-[state=checked]:bg-primary"
            />
          </div>

          <div class="hidden group-hover:flex items-center gap-1 -mr-1">
            <button
              class="w-7 h-7 rounded-md hover:bg-background border border-transparent hover:border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-all"
              @click.stop="emit('openEdit', props.source)"
              title="查看详情"
            >
              <Edit2 class="h-3.5 w-3.5" />
            </button>
            <button
              class="w-7 h-7 rounded-md hover:bg-destructive hover:text-destructive-foreground hover:border-transparent border border-transparent flex items-center justify-center text-muted-foreground transition-all"
              @click.stop="emit('deleteSource', props.source)"
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
