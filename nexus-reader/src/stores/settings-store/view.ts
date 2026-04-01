import { computed } from "vue";
import {
  CLIENT_ROUTE_KINDS,
  FONT_FAMILY_MAP,
  THEME_COLORS,
  clampSettingValue,
  formatRouteLatency,
  formatRouteShare,
  persistConfig,
} from "@/utils/settingsStore";
import type { ThemeColors } from "@/types/settings";
import type {
  SettingsStoreState,
  SettingsStoreView,
} from "./types";

export function createSettingsStoreView(
  state: SettingsStoreState,
): SettingsStoreView {
  const currentFontFamily = computed(
    () => FONT_FAMILY_MAP[state.config.fontFamily] || FONT_FAMILY_MAP.system,
  );

  const themeColors = computed<ThemeColors>(() => {
    if (state.config.theme === "custom") {
      return {
        bg: state.config.customColors.bg,
        text: state.config.customColors.text,
      };
    }
    return THEME_COLORS[state.config.theme];
  });

  const clientRoutingSummary = computed(() => {
    const analytics = state.clientRouting.value;

    return {
      window: analytics?.window ?? "",
      note: analytics?.note ?? "",
      routes: CLIENT_ROUTE_KINDS.map((route) => ({
        key: route,
        label: route,
        shareLabel: formatRouteShare(analytics?.routeSharePct?.[route]),
        p50Label: formatRouteLatency(analytics?.latencySummary?.[route]?.p50),
        p95Label: formatRouteLatency(analytics?.latencySummary?.[route]?.p95),
      })),
    };
  });

  const agentRoutingSummary = computed(() => {
    const analytics = state.agentRouting.value;
    const totalSelections = Number(analytics?.totalSelections ?? 0);
    const skillCounts = analytics?.skillCounts ?? {};
    const topSkills = Object.entries(skillCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([skill, count]) => ({
        key: skill,
        label: skill,
        countLabel: `${count}`,
        shareLabel:
          totalSelections > 0 ? `${((count / totalSelections) * 100).toFixed(2)}%` : "--",
      }));

    return {
      window: analytics?.window ?? "",
      totalSelectionsLabel: `${totalSelections}`,
      aiAttemptRateLabel: formatRouteShare(analytics?.summary?.aiAttemptRatePct),
      fallbackRateLabel: formatRouteShare(analytics?.summary?.fallbackRatePct),
      aiTimeoutRateLabel: formatRouteShare(analytics?.summary?.aiTimeoutRatePct),
      topSkills,
    };
  });

  const agentRoutingConfigSummary = computed(() => {
    const config = state.agentConfig.value?.config;
    const includeRoutes = config?.includeRoutes ?? [];
    const excludeRoutes = config?.excludeRoutes ?? [];

    return {
      enabledLabel: config ? (config.enabled ? "Enabled" : "Disabled") : "--",
      shadowModeLabel: config ? (config.shadowMode ? "Enabled" : "Disabled") : "--",
      aiEnabledLabel: config ? (config.allowAISelection ? "Enabled" : "Disabled") : "--",
      rolloutLabel: config ? `${config.rolloutPercent}%` : "--",
      timeoutLabel: config ? `${config.aiMaxLatencyMs}ms` : "--",
      confidenceLabel: config ? `${(config.minConfidence * 100).toFixed(0)}%` : "--",
      includeRoutesLabel: includeRoutes.length > 0 ? includeRoutes.join(", ") : "--",
      excludeRoutesLabel: excludeRoutes.length > 0 ? excludeRoutes.join(", ") : "--",
    };
  });

  const agentRoutingConfigRaw = computed(() => {
    const snapshot = state.agentConfig.value;
    const config = snapshot?.config;
    return {
      source: snapshot?.source ?? "--",
      overrideUpdatedAt: snapshot?.overrideUpdatedAt ?? "--",
      overrideUpdatedBy: snapshot?.overrideUpdatedBy ?? "--",
      enabled: Boolean(config?.enabled),
      shadowMode: Boolean(config?.shadowMode),
      allowAISelection: Boolean(config?.allowAISelection),
      rolloutPercent: Number(config?.rolloutPercent ?? 0),
      aiMaxLatencyMs: Number(config?.aiMaxLatencyMs ?? 300),
      minConfidencePercent: Math.round(Number(config?.minConfidence ?? 0.65) * 100),
      includeRoutes: [...(config?.includeRoutes ?? [])],
      excludeRoutes: [...(config?.excludeRoutes ?? [])],
    };
  });

  const agentRoutingAuditSummary = computed(() => {
    const records = state.agentConfigAudit.value ?? [];

    return {
      hasMore: state.agentConfigAuditHasMore.value,
      records: records.map((item) => ({
        id: item.id,
        action: item.action,
        actor: item.actorId || "--",
        timestamp: item.timestamp,
        changeItems: (item.changes || []).map(change => {
          const before = JSON.stringify(change.before);
          const after = JSON.stringify(change.after);
          return `${change.field}: ${before} -> ${after}`;
        }).slice(0, 5),
      })),
    };
  });

  const sourcePackageDetailSummary = computed(() => {
    const detail = state.sourcePackageDetail.value
    const capabilities = detail?.capabilities
    const samples = detail?.samples
    const documentation = detail?.documentation
    const searchProfile = detail?.searchProfile

    const capabilityItems = capabilities
      ? [
          `搜索: ${capabilities.searchSupported ? "支持" : "缺失"}`,
          `书籍详情: ${capabilities.bookSupported ? "支持" : "缺失"}`,
          `目录: ${capabilities.tocSupported ? "支持" : "缺失"}`,
          `正文: ${capabilities.contentSupported ? "支持" : "缺失"}`,
          `直达详情: ${capabilities.directDetailSupported ? "支持" : "未识别"}`,
          `外部发现: ${capabilities.externalDiscoverySupported ? "支持" : "未识别"}`,
          `搜索分页: ${capabilities.searchPaginationSupported ? "支持" : "未识别"}`,
          `搜索特参: ${capabilities.searchSpecialParamSupported ? "支持" : "未识别"}`,
          `分页: ${capabilities.paginationSupported ? "支持" : "未识别"}`,
          `字体解密: ${capabilities.fontDecryptSupported ? "疑似需要" : "未识别"}`,
          `脚本清洗: ${capabilities.scriptCleanSupported ? "已启用建议" : "未启用"}`,
        ]
      : []

    const searchStrategyItems = searchProfile
      ? searchProfile.strategies.map(strategy => {
          const parts = [
            strategy.id,
            strategy.mode,
            `enabled=${strategy.enabled}`,
            `priority=${strategy.priority}`,
            `provider=${strategy.provider}`,
          ]
          const note =
            strategy.disabledReason ||
            strategy.queryTemplate ||
            strategy.detailUrlTemplate ||
            strategy.resultSelector

          return note ? `${parts.join(" · ")} · ${note}` : parts.join(" · ")
        })
      : []

    const sampleItems = [
      samples?.bookSampleUrl ? `书籍样本: ${samples.bookSampleUrl}` : "",
      samples?.chapterSampleUrl ? `章节样本: ${samples.chapterSampleUrl}` : "",
      samples?.bookSampleFingerprint ? `书籍指纹: ${samples.bookSampleFingerprint}` : "",
      samples?.chapterSampleFingerprint ? `章节指纹: ${samples.chapterSampleFingerprint}` : "",
    ].filter(Boolean)

    return {
      packageId: detail?.packageId ?? "--",
      sourceLabel: detail ? `${detail.source.name} (${detail.source.id})` : "--",
      generatedAtLabel: detail?.generatedAtMs
        ? new Date(detail.generatedAtMs).toLocaleString()
        : "--",
      validationLabel: detail?.validation
        ? `${detail.validation.valid ? "通过" : "失败"} / ${Math.round((detail.validation.score ?? 0) * 100)}`
        : "--",
      warningItems: detail?.validation?.warnings ?? [],
      errorItems: detail?.validation?.errors ?? [],
      capabilityItems,
      searchStrategyItems,
      sampleItems,
      riskItems: documentation?.knownRisks ?? [],
    };
  });

  const sourceBuildPreviewSummary = computed(() => {
    const preview = state.sourceBuildPreview.value
    const diagnostics = preview?.diagnostics
    const validation = preview?.package.validation

    return {
      hasPreview: Boolean(preview),
      sourceLabel: preview
        ? `${preview.package.source.name} (${preview.package.source.id})`
        : "--",
      packageId: preview?.package.packageId ?? "--",
      validationLabel: validation
        ? `${validation.valid ? "通过" : "失败"} / ${Math.round((validation.score ?? 0) * 100)}`
        : "--",
      diagnosticsItems: diagnostics
        ? [
            `host: ${diagnostics.host}`,
            `book sample: ${diagnostics.bookSampleUrl}`,
            `chapter sample: ${diagnostics.chapterSampleUrl}`,
            `search strategy: ${diagnostics.searchStrategy}`,
            `generalization: ${Math.round((diagnostics.generalizationScore ?? 0) * 100)}`,
          ]
        : [],
      warningItems: validation?.warnings ?? [],
      riskItems: diagnostics?.riskFlags ?? [],
      packageJson: preview?.packageJson ?? "",
    }
  })

  const theme = computed<"light" | "dark" | "auto">({
    get: () => (state.config.theme === "night" ? "dark" : "light"),
    set: (value) => {
      if (value === "dark") {
        state.config.theme = "night";
      } else if (value === "light") {
        state.config.theme = "white";
      }
      persistConfig(state.config, state.language.value);
    },
  });

  const fontSize = computed<number>({
    get: () => state.config.fontSize,
    set: (value) => {
      state.config.fontSize = clampSettingValue(value, 12, 32);
      persistConfig(state.config, state.language.value);
    },
  });

  return {
    currentFontFamily,
    themeColors,
    clientRoutingSummary,
    agentRoutingSummary,
    agentRoutingConfigSummary,
    agentRoutingConfigRaw,
    agentRoutingAuditSummary,
    sourcePackageDetailSummary,
    sourceBuildPreviewSummary,
    theme,
    fontSize,
  };
}
