import { computed } from 'vue'
import {
  FONT_FAMILY_MAP,
  THEME_COLORS,
  clampSettingValue,
  persistConfig,
} from '@/stores/settings-store/helpers'
import type { ThemeColors } from '@/types/settings'
import type { SourceHealthSegment, SourceHealthStatus } from '@/api/sync'
import type { SettingsStoreState, SettingsStoreView } from './types'

function formatHealthStatus(status: SourceHealthStatus | undefined) {
  switch (status) {
    case 'pass':
      return '通过'
    case 'warn':
      return '告警'
    case 'fail':
      return '失败'
    default:
      return '未知'
  }
}

function formatReadinessState(
  state:
    | 'draft'
    | 'blocked'
    | 'search_ready'
    | 'catalog_ready'
    | 'reading_ready'
    | 'full_flow_ready'
    | undefined
) {
  switch (state) {
    case 'full_flow_ready':
      return '全链路可用'
    case 'reading_ready':
      return '可读待搜'
    case 'catalog_ready':
      return '目录就绪'
    case 'search_ready':
      return '可搜索'
    case 'blocked':
      return '阻塞'
    default:
      return '草稿'
  }
}

function buildSegmentItems(
  health?: {
    search: SourceHealthSegment
    book: SourceHealthSegment
    toc: SourceHealthSegment
    content: SourceHealthSegment
  } | null
) {
  if (!health) {
    return []
  }

  const segments: Array<[string, SourceHealthSegment]> = [
    ['搜索', health.search],
    ['详情', health.book],
    ['目录', health.toc],
    ['正文', health.content],
  ]

  return segments.map(([label, segment]) => {
    const parts = [label, formatHealthStatus(segment.status)]
    if (segment.qualityScore != null) {
      parts.push(`质量=${Math.round(segment.qualityScore * 100)}`)
    }
    if (segment.failureCode) {
      parts.push(`code=${segment.failureCode}`)
    }
    if (segment.warnings.length > 0) {
      parts.push(`warn=${segment.warnings.length}`)
    }
    return parts.join(' · ')
  })
}

export function createSettingsStoreView(state: SettingsStoreState): SettingsStoreView {
  const currentFontFamily = computed(
    () => FONT_FAMILY_MAP[state.config.fontFamily] || FONT_FAMILY_MAP.system
  )

  const themeColors = computed<ThemeColors>(() => THEME_COLORS[state.config.theme])

  const sourcePackageDetailSummary = computed(() => {
    const detail = state.sourcePackageDetail.value
    const capabilities = detail?.capabilities
    const samples = detail?.samples
    const documentation = detail?.documentation
    const searchProfile = detail?.searchProfile

    const capabilityItems = capabilities
      ? [
          `搜索: ${capabilities.searchSupported ? '支持' : '缺失'}`,
          `书籍详情: ${capabilities.bookSupported ? '支持' : '缺失'}`,
          `目录: ${capabilities.tocSupported ? '支持' : '缺失'}`,
          `正文: ${capabilities.contentSupported ? '支持' : '缺失'}`,
          `直达详情: ${capabilities.directDetailSupported ? '支持' : '未识别'}`,
          `外部发现: ${capabilities.externalDiscoverySupported ? '支持' : '未识别'}`,
          `搜索分页: ${capabilities.searchPaginationSupported ? '支持' : '未识别'}`,
          `搜索特参: ${capabilities.searchSpecialParamSupported ? '支持' : '未识别'}`,
          `分页: ${capabilities.paginationSupported ? '支持' : '未识别'}`,
          `字体解密: ${capabilities.fontDecryptSupported ? '疑似需要' : '未识别'}`,
          `脚本清洗: ${capabilities.scriptCleanSupported ? '已启用建议' : '未启用'}`,
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

          return note ? `${parts.join(' · ')} · ${note}` : parts.join(' · ')
        })
      : []

    const sampleItems = [
      samples?.bookSampleUrl ? `书籍样本: ${samples.bookSampleUrl}` : '',
      samples?.chapterSampleUrl ? `章节样本: ${samples.chapterSampleUrl}` : '',
      samples?.bookSampleFingerprint ? `书籍指纹: ${samples.bookSampleFingerprint}` : '',
      samples?.chapterSampleFingerprint ? `章节指纹: ${samples.chapterSampleFingerprint}` : '',
    ].filter(Boolean)

    return {
      packageId: detail?.packageId ?? '--',
      sourceLabel: detail ? `${detail.source.name} (${detail.source.id})` : '--',
      generatedAtLabel: detail?.generatedAtMs
        ? new Date(detail.generatedAtMs).toLocaleString()
        : '--',
      validationLabel: detail?.validation
        ? `${detail.validation.valid ? '通过' : '失败'} / ${Math.round((detail.validation.score ?? 0) * 100)}`
        : '--',
      healthLabel: detail
        ? `${formatReadinessState(detail.readiness?.state)} · ${
            detail.validation?.health?.recommended ? '推荐' : '需复核'
          }`
        : '--',
      healthScoreLabel:
        detail?.validation?.health != null
          ? `${Math.round((detail.validation.health.overallScore ?? 0) * 100)}`
          : '--',
      segmentItems: buildSegmentItems(detail?.validation?.health),
      warningItems: detail?.validation?.warnings ?? [],
      errorItems: detail?.validation?.errors ?? [],
      capabilityItems,
      searchStrategyItems,
      sampleItems,
      riskItems: documentation?.knownRisks ?? [],
      readinessBlockers: detail?.readiness?.blockers ?? [],
      readinessSuggestedActions: detail?.readiness?.suggestedActions ?? [],
    }
  })

  const theme = computed<'light' | 'dark' | 'auto'>({
    get: () => (state.config.theme === 'night' ? 'dark' : 'light'),
    set: value => {
      if (value === 'dark') {
        state.config.theme = 'night'
      } else if (value === 'light') {
        state.config.theme = 'wechat'
      }
      persistConfig(state.config, state.language.value)
    },
  })

  const fontSize = computed<number>({
    get: () => state.config.fontSize,
    set: value => {
      state.config.fontSize = clampSettingValue(value, 12, 32)
      persistConfig(state.config, state.language.value)
    },
  })

  return {
    currentFontFamily,
    themeColors,
    sourcePackageDetailSummary,
    theme,
    fontSize,
  }
}
