<script setup lang="ts">
import { reactive, toRefs, watch } from "vue";
import { Info } from "lucide-vue-next";
import type { AgentRouterConfigPatch } from "@/api/sync";

type RouteStat = {
  key: string;
  label: string;
  shareLabel: string;
  p50Label: string;
  p95Label: string;
};

type ClientRoutingSummary = {
  window: string;
  note: string;
  routes: RouteStat[];
};

type AgentRoutingSummary = {
  window: string;
  totalSelectionsLabel: string;
  aiAttemptRateLabel: string;
  fallbackRateLabel: string;
  aiTimeoutRateLabel: string;
  topSkills: Array<{
    key: string;
    label: string;
    countLabel: string;
    shareLabel: string;
  }>;
};

type AgentRoutingConfigSummary = {
  enabledLabel: string;
  shadowModeLabel: string;
  aiEnabledLabel: string;
  rolloutLabel: string;
  timeoutLabel: string;
  confidenceLabel: string;
  includeRoutesLabel: string;
  excludeRoutesLabel: string;
};

type AgentRoutingConfigRaw = {
  source: string;
  overrideUpdatedAt: string;
  overrideUpdatedBy: string;
  enabled: boolean;
  shadowMode: boolean;
  allowAISelection: boolean;
  rolloutPercent: number;
  aiMaxLatencyMs: number;
  minConfidencePercent: number;
  includeRoutes: string[];
  excludeRoutes: string[];
};

type AgentRoutingAuditSummary = {
  hasMore: boolean;
  records: Array<{
    id: string;
    action: string;
    actor: string;
    timestamp: string;
    changeItems: string[];
  }>;
};

const props = defineProps<{
  clientRoutingLoading: boolean;
  clientRoutingSummary: ClientRoutingSummary;
  agentRoutingLoading: boolean;
  agentRoutingSummary: AgentRoutingSummary;
  agentConfigLoading: boolean;
  agentConfigSaving: boolean;
  agentConfigAuditLoading: boolean;
  agentRoutingConfigSummary: AgentRoutingConfigSummary;
  agentRoutingConfigRaw: AgentRoutingConfigRaw;
  agentRoutingAuditSummary: AgentRoutingAuditSummary;
}>();

const emit = defineEmits<{
  refresh: [];
  setAgentConfigDisabled: [];
  setAgentConfigShadow: [];
  setAgentConfigCanary: [];
  saveAgentConfigCustom: [patch: AgentRouterConfigPatch];
  resetAgentConfigOverride: [];
  loadMoreAgentAudit: [];
}>();
const {
  clientRoutingLoading,
  clientRoutingSummary,
  agentRoutingLoading,
  agentRoutingSummary,
  agentConfigLoading,
  agentConfigSaving,
  agentConfigAuditLoading,
  agentRoutingConfigSummary,
  agentRoutingConfigRaw,
  agentRoutingAuditSummary,
} = toRefs(props);

const draft = reactive({
  enabled: false,
  shadowMode: false,
  allowAISelection: true,
  rolloutPercent: 0,
  aiMaxLatencyMs: 300,
  minConfidencePercent: 65,
  includeRoutesText: "",
  excludeRoutesText: "",
});

watch(
  () => props.agentRoutingConfigRaw,
  (value) => {
    draft.enabled = value.enabled;
    draft.shadowMode = value.shadowMode;
    draft.allowAISelection = value.allowAISelection;
    draft.rolloutPercent = value.rolloutPercent;
    draft.aiMaxLatencyMs = value.aiMaxLatencyMs;
    draft.minConfidencePercent = value.minConfidencePercent;
    draft.includeRoutesText = value.includeRoutes.join(", ");
    draft.excludeRoutesText = value.excludeRoutes.join(", ");
  },
  { immediate: true },
);

function parseRouteText(raw: string): string[] {
  return raw
    .split(/[\n,]/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function submitCustomConfig() {
  const patch: AgentRouterConfigPatch = {
    enabled: draft.enabled,
    shadowMode: draft.shadowMode,
    allowAISelection: draft.allowAISelection,
    rolloutPercent: Math.max(0, Math.min(100, Number(draft.rolloutPercent || 0))),
    aiMaxLatencyMs: Math.max(100, Math.min(3000, Number(draft.aiMaxLatencyMs || 300))),
    minConfidence: Math.max(0, Math.min(1, Number(draft.minConfidencePercent || 65) / 100)),
    includeRoutes: parseRouteText(draft.includeRoutesText),
    excludeRoutes: parseRouteText(draft.excludeRoutesText),
  };
  emit("saveAgentConfigCustom", patch);
}
</script>

<template>
  <section class="mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-250">
    <div class="flex items-center gap-2 mb-4 px-1">
      <Info class="w-4 h-4 text-primary" />
      <h2 class="text-sm font-bold text-muted-foreground uppercase tracking-wider">
        网络路径 / 直连效果
      </h2>
      <span v-if="clientRoutingSummary.window" class="text-xs text-muted-foreground/70 ml-auto">
        窗口：{{ clientRoutingSummary.window }}
      </span>
    </div>

    <div class="rounded-2xl border border-border/50 bg-card overflow-hidden">
      <div class="p-5 flex items-start justify-between gap-3">
        <div class="space-y-1">
          <p class="text-sm font-medium">路由占比</p>
          <p class="text-xs text-muted-foreground">direct / edge</p>
        </div>
        <button
          class="h-8 px-3 text-xs rounded-full border bg-background hover:bg-muted transition-colors"
          :disabled="clientRoutingLoading"
          @click="emit('refresh')"
        >
          {{ clientRoutingLoading ? "刷新中..." : "刷新" }}
        </button>
      </div>

      <div class="px-5 pb-5 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div
          v-for="routeStat in clientRoutingSummary.routes"
          :key="routeStat.key"
          class="rounded-xl border border-border/50 bg-muted/20 p-4"
        >
          <p class="text-xs text-muted-foreground mb-1">{{ routeStat.label }}</p>
          <p class="text-lg font-semibold">{{ routeStat.shareLabel }}</p>
          <p class="text-xs text-muted-foreground mt-2">
            p50 {{ routeStat.p50Label }} · p95 {{ routeStat.p95Label }}
          </p>
        </div>
      </div>

      <div v-if="clientRoutingSummary.note" class="px-5 pb-5 text-xs text-muted-foreground/70">
        {{ clientRoutingSummary.note }}
      </div>
    </div>

    <div class="rounded-2xl border border-border/50 bg-card overflow-hidden mt-4">
      <div class="p-5 flex items-start justify-between gap-3">
        <div class="space-y-1">
          <p class="text-sm font-medium">Agent 路由策略</p>
          <p class="text-xs text-muted-foreground">规则优先 + AI增强</p>
        </div>
        <span v-if="agentRoutingSummary.window" class="text-xs text-muted-foreground/70">
          窗口：{{ agentRoutingSummary.window }}
        </span>
      </div>

      <div class="px-5 pb-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div class="rounded-xl border border-border/50 bg-muted/20 p-4">
          <p class="text-xs text-muted-foreground mb-1">总选择次数</p>
          <p class="text-lg font-semibold">{{ agentRoutingSummary.totalSelectionsLabel }}</p>
        </div>
        <div class="rounded-xl border border-border/50 bg-muted/20 p-4">
          <p class="text-xs text-muted-foreground mb-1">AI 参与率</p>
          <p class="text-lg font-semibold">{{ agentRoutingSummary.aiAttemptRateLabel }}</p>
        </div>
        <div class="rounded-xl border border-border/50 bg-muted/20 p-4">
          <p class="text-xs text-muted-foreground mb-1">回退率</p>
          <p class="text-lg font-semibold">{{ agentRoutingSummary.fallbackRateLabel }}</p>
        </div>
        <div class="rounded-xl border border-border/50 bg-muted/20 p-4">
          <p class="text-xs text-muted-foreground mb-1">AI 超时率</p>
          <p class="text-lg font-semibold">{{ agentRoutingSummary.aiTimeoutRateLabel }}</p>
        </div>
      </div>

      <div class="px-5 pb-5">
        <p class="text-xs text-muted-foreground mb-2">Top Skills</p>
        <div v-if="agentRoutingSummary.topSkills.length > 0" class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div
            v-for="skill in agentRoutingSummary.topSkills"
            :key="skill.key"
            class="rounded-xl border border-border/50 bg-muted/20 p-4"
          >
            <p class="text-xs text-muted-foreground mb-1">{{ skill.label }}</p>
            <p class="text-lg font-semibold">{{ skill.countLabel }}</p>
            <p class="text-xs text-muted-foreground mt-2">占比 {{ skill.shareLabel }}</p>
          </div>
        </div>
        <p v-else class="text-xs text-muted-foreground/70">
          {{ agentRoutingLoading ? "加载中..." : "暂无 agent 路由数据" }}
        </p>
      </div>
    </div>

    <div class="rounded-2xl border border-border/50 bg-card overflow-hidden mt-4">
      <div class="p-5">
        <p class="text-sm font-medium">Agent 运行配置</p>
        <p class="text-xs text-muted-foreground mt-1">当前 worker 环境实时配置快照</p>
      </div>

      <div class="px-5 pb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div class="rounded-xl border border-border/50 bg-muted/20 p-4">
          <p class="text-xs text-muted-foreground mb-1">总开关</p>
          <p class="text-lg font-semibold">{{ agentRoutingConfigSummary.enabledLabel }}</p>
        </div>
        <div class="rounded-xl border border-border/50 bg-muted/20 p-4">
          <p class="text-xs text-muted-foreground mb-1">Shadow 模式</p>
          <p class="text-lg font-semibold">{{ agentRoutingConfigSummary.shadowModeLabel }}</p>
        </div>
        <div class="rounded-xl border border-border/50 bg-muted/20 p-4">
          <p class="text-xs text-muted-foreground mb-1">AI 选择</p>
          <p class="text-lg font-semibold">{{ agentRoutingConfigSummary.aiEnabledLabel }}</p>
        </div>
        <div class="rounded-xl border border-border/50 bg-muted/20 p-4">
          <p class="text-xs text-muted-foreground mb-1">Rollout</p>
          <p class="text-lg font-semibold">{{ agentRoutingConfigSummary.rolloutLabel }}</p>
        </div>
        <div class="rounded-xl border border-border/50 bg-muted/20 p-4">
          <p class="text-xs text-muted-foreground mb-1">AI 超时阈值</p>
          <p class="text-lg font-semibold">{{ agentRoutingConfigSummary.timeoutLabel }}</p>
        </div>
        <div class="rounded-xl border border-border/50 bg-muted/20 p-4">
          <p class="text-xs text-muted-foreground mb-1">最小置信度</p>
          <p class="text-lg font-semibold">{{ agentRoutingConfigSummary.confidenceLabel }}</p>
        </div>
      </div>

      <div class="px-5 pb-5 space-y-2 text-xs text-muted-foreground/80">
        <div class="flex flex-wrap gap-2 pb-2">
          <button
            class="h-8 px-3 text-xs rounded-full border bg-background hover:bg-muted transition-colors"
            :disabled="agentConfigSaving"
            @click="emit('setAgentConfigDisabled')"
          >
            关闭 Agent
          </button>
          <button
            class="h-8 px-3 text-xs rounded-full border bg-background hover:bg-muted transition-colors"
            :disabled="agentConfigSaving"
            @click="emit('setAgentConfigShadow')"
          >
            Shadow 全量
          </button>
          <button
            class="h-8 px-3 text-xs rounded-full border bg-background hover:bg-muted transition-colors"
            :disabled="agentConfigSaving"
            @click="emit('setAgentConfigCanary')"
          >
            Canary 10%
          </button>
          <button
            class="h-8 px-3 text-xs rounded-full border bg-background hover:bg-muted transition-colors"
            :disabled="agentConfigSaving"
            @click="emit('resetAgentConfigOverride')"
          >
            重置为环境配置
          </button>
        </div>
        <p>
          <span class="font-medium text-foreground">Include:</span>
          {{ agentRoutingConfigSummary.includeRoutesLabel }}
        </p>
        <p>
          <span class="font-medium text-foreground">Exclude:</span>
          {{ agentRoutingConfigSummary.excludeRoutesLabel }}
        </p>
        <p>
          <span class="font-medium text-foreground">Source:</span>
          {{ agentRoutingConfigRaw.source }}
        </p>
        <p>
          <span class="font-medium text-foreground">Updated:</span>
          {{ agentRoutingConfigRaw.overrideUpdatedAt }} · {{ agentRoutingConfigRaw.overrideUpdatedBy }}
        </p>
        <p v-if="agentConfigLoading" class="text-muted-foreground/70">配置加载中...</p>
        <p v-if="agentConfigSaving" class="text-muted-foreground/70">配置保存中...</p>
      </div>

      <div class="px-5 pb-5 border-t border-border/40 space-y-3">
        <p class="text-sm font-medium">自定义参数编辑</p>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <label class="rounded-xl border border-border/50 bg-muted/20 p-3 space-y-2">
            <span class="text-muted-foreground">Enabled</span>
            <input v-model="draft.enabled" type="checkbox" class="h-4 w-4" />
          </label>
          <label class="rounded-xl border border-border/50 bg-muted/20 p-3 space-y-2">
            <span class="text-muted-foreground">Shadow Mode</span>
            <input v-model="draft.shadowMode" type="checkbox" class="h-4 w-4" />
          </label>
          <label class="rounded-xl border border-border/50 bg-muted/20 p-3 space-y-2">
            <span class="text-muted-foreground">Allow AI</span>
            <input v-model="draft.allowAISelection" type="checkbox" class="h-4 w-4" />
          </label>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <label class="space-y-1">
            <span class="text-muted-foreground">Rollout %</span>
            <input
              v-model.number="draft.rolloutPercent"
              type="number"
              min="0"
              max="100"
              class="w-full h-9 px-3 rounded-lg border bg-background"
            />
          </label>
          <label class="space-y-1">
            <span class="text-muted-foreground">AI Timeout (ms)</span>
            <input
              v-model.number="draft.aiMaxLatencyMs"
              type="number"
              min="100"
              max="3000"
              class="w-full h-9 px-3 rounded-lg border bg-background"
            />
          </label>
          <label class="space-y-1">
            <span class="text-muted-foreground">Min Confidence %</span>
            <input
              v-model.number="draft.minConfidencePercent"
              type="number"
              min="0"
              max="100"
              class="w-full h-9 px-3 rounded-lg border bg-background"
            />
          </label>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <label class="space-y-1">
            <span class="text-muted-foreground">Include Routes (comma/newline separated)</span>
            <textarea
              v-model="draft.includeRoutesText"
              rows="3"
              class="w-full px-3 py-2 rounded-lg border bg-background"
            />
          </label>
          <label class="space-y-1">
            <span class="text-muted-foreground">Exclude Routes (comma/newline separated)</span>
            <textarea
              v-model="draft.excludeRoutesText"
              rows="3"
              class="w-full px-3 py-2 rounded-lg border bg-background"
            />
          </label>
        </div>

        <div class="flex justify-end">
          <button
            class="h-9 px-4 text-xs rounded-full border bg-background hover:bg-muted transition-colors"
            :disabled="agentConfigSaving"
            @click="submitCustomConfig"
          >
            保存自定义配置
          </button>
        </div>
      </div>

      <div class="px-5 pb-5 border-t border-border/40 space-y-3">
        <p class="text-sm font-medium">配置变更审计</p>
        <div v-if="agentRoutingAuditSummary.records.length > 0" class="space-y-2">
          <div
            v-for="record in agentRoutingAuditSummary.records"
            :key="record.id"
            class="rounded-lg border border-border/40 bg-muted/20 p-3 text-xs space-y-1"
          >
            <p>
              <span class="font-medium">{{ record.action }}</span>
              · {{ record.timestamp }}
              · by {{ record.actor }}
            </p>
            <div class="flex flex-wrap gap-1.5">
              <span
                v-for="item in record.changeItems"
                :key="`${record.id}-${item}`"
                class="px-2 py-1 rounded-full border border-border/50 bg-background text-[11px]"
              >
                {{ item }}
              </span>
              <span
                v-if="record.changeItems.length === 0"
                class="text-muted-foreground"
              >
                no field changed
              </span>
            </div>
          </div>
        </div>
        <p v-else class="text-xs text-muted-foreground/70">
          {{ agentConfigAuditLoading ? "审计日志加载中..." : "暂无配置变更记录" }}
        </p>
        <div v-if="agentRoutingAuditSummary.hasMore" class="pt-1">
          <button
            class="h-8 px-3 text-xs rounded-full border bg-background hover:bg-muted transition-colors"
            :disabled="agentConfigAuditLoading"
            @click="emit('loadMoreAgentAudit')"
          >
            {{ agentConfigAuditLoading ? "加载中..." : "加载更多" }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
