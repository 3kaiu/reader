import type { ComputedRef, Ref, WritableComputedRef } from 'vue'
import type {
  AgentRouterConfigPatch,
  AgentRouterConfigAuditRecord,
  AgentRouterConfigSnapshot,
  AgentRouterStats,
  ClientRoutingAnalytics,
  NxsSourcePackageDetail,
  SourceBuildFromSamplesResponse,
  SourcePackageSummary,
} from '@/api/sync'
import type { ReaderConfig, ThemeColors } from '@/types/settings'

export type NotificationSettings = {
  enabled: boolean
  sound: boolean
  desktop: boolean
}

export type PrivacySettings = {
  analytics: boolean
  crashReports: boolean
  usageData: boolean
}

export type ClientRoutingSummary = {
  window: string
  note: string
  routes: Array<{
    key: string
    label: string
    shareLabel: string
    p50Label: string
    p95Label: string
  }>
}

export type AgentRoutingSummary = {
  window: string
  totalSelectionsLabel: string
  aiAttemptRateLabel: string
  fallbackRateLabel: string
  aiTimeoutRateLabel: string
  topSkills: Array<{
    key: string
    label: string
    countLabel: string
    shareLabel: string
  }>
}

export type AgentRoutingConfigSummary = {
  enabledLabel: string
  shadowModeLabel: string
  aiEnabledLabel: string
  rolloutLabel: string
  timeoutLabel: string
  confidenceLabel: string
  includeRoutesLabel: string
  excludeRoutesLabel: string
}

export type AgentRoutingConfigRaw = {
  source: string
  overrideUpdatedAt: string
  overrideUpdatedBy: string
  enabled: boolean
  shadowMode: boolean
  allowAISelection: boolean
  rolloutPercent: number
  aiMaxLatencyMs: number
  minConfidencePercent: number
  includeRoutes: string[]
  excludeRoutes: string[]
}

export type AgentRoutingAuditSummary = {
  hasMore: boolean
  records: Array<{
    id: string
    action: string
    actor: string
    timestamp: string
    changeItems: string[]
  }>
}

export type SourcePackageDetailSummary = {
  packageId: string
  sourceLabel: string
  generatedAtLabel: string
  validationLabel: string
  healthLabel: string
  healthScoreLabel: string
  segmentItems: string[]
  warningItems: string[]
  errorItems: string[]
  capabilityItems: string[]
  searchStrategyItems: string[]
  sampleItems: string[]
  riskItems: string[]
  readinessBlockers: string[]
  readinessSuggestedActions: string[]
}

export type SourceBuildPreviewSummary = {
  hasPreview: boolean
  sourceLabel: string
  packageId: string
  validationLabel: string
  healthLabel: string
  healthScoreLabel: string
  segmentItems: string[]
  diagnosticsItems: string[]
  warningItems: string[]
  riskItems: string[]
  readinessBlockers: string[]
  readinessSuggestedActions: string[]
  packageJson: string
}

export interface SettingsStoreState {
  config: ReaderConfig
  language: Ref<string>
  notifications: Ref<NotificationSettings>
  privacy: Ref<PrivacySettings>
  clientRouting: Ref<ClientRoutingAnalytics | null>
  clientRoutingLoading: Ref<boolean>
  agentRouting: Ref<AgentRouterStats | null>
  agentRoutingLoading: Ref<boolean>
  agentConfig: Ref<AgentRouterConfigSnapshot | null>
  agentConfigLoading: Ref<boolean>
  agentConfigSaving: Ref<boolean>
  agentConfigAudit: Ref<AgentRouterConfigAuditRecord[]>
  agentConfigAuditLoading: Ref<boolean>
  agentConfigAuditNextCursor: Ref<string | null>
  agentConfigAuditHasMore: Ref<boolean>
  sourcePackages: Ref<SourcePackageSummary[]>
  sourcePackagesLoading: Ref<boolean>
  sourcePackageImporting: Ref<boolean>
  sourcePackageDetail: Ref<NxsSourcePackageDetail | null>
  sourcePackageDetailLoading: Ref<boolean>
  sourceBuildRunning: Ref<boolean>
  sourceBuildPreview: Ref<SourceBuildFromSamplesResponse | null>
}

export interface SettingsStoreView {
  currentFontFamily: ComputedRef<string>
  themeColors: ComputedRef<ThemeColors>
  clientRoutingSummary: ComputedRef<ClientRoutingSummary>
  agentRoutingSummary: ComputedRef<AgentRoutingSummary>
  agentRoutingConfigSummary: ComputedRef<AgentRoutingConfigSummary>
  agentRoutingConfigRaw: ComputedRef<AgentRoutingConfigRaw>
  agentRoutingAuditSummary: ComputedRef<AgentRoutingAuditSummary>
  sourcePackageDetailSummary: ComputedRef<SourcePackageDetailSummary>
  sourceBuildPreviewSummary: ComputedRef<SourceBuildPreviewSummary>
  theme: WritableComputedRef<'light' | 'dark' | 'auto'>
  fontSize: WritableComputedRef<number>
}

export interface SettingsStoreActions {
  updateConfig<K extends keyof ReaderConfig>(key: K, value: ReaderConfig[K]): void
  resetConfig(): void
  increaseFontSize(): void
  decreaseFontSize(): void
  increaseLineHeight(): void
  decreaseLineHeight(): void
  toggleAutoNightMode(enabled: boolean): void
  applyAutoNightMode(): void
  updateTheme(newTheme: 'light' | 'dark' | 'auto'): void
  updateLanguage(newLanguage: string): Promise<void>
  updateFontSize(newSize: number): void
  updateNotifications(settings: Partial<NotificationSettings>): void
  updatePrivacy(settings: Partial<PrivacySettings>): void
  refreshClientRouting(): Promise<void>
  clearClientRouting(): void
  refreshAgentRouting(): Promise<void>
  clearAgentRouting(): void
  refreshAgentConfig(): Promise<void>
  clearAgentConfig(): void
  updateAgentConfig(patch: AgentRouterConfigPatch): Promise<boolean>
  resetAgentConfig(): Promise<boolean>
  refreshAgentConfigAudit(limit?: number): Promise<void>
  loadMoreAgentConfigAudit(limit?: number): Promise<void>
  clearAgentConfigAudit(): void
  refreshSourcePackages(): Promise<void>
  clearSourcePackages(): void
  importSourcePackage(packageJson: string): Promise<boolean>
  deleteSourcePackage(sourceId: string): Promise<boolean>
  loadSourcePackageDetail(sourceId: string): Promise<void>
  clearSourcePackageDetail(): void
  buildSourcePackageFromSamples(payload: {
    bookCurl: string
    chapterCurl: string
    searchCurl?: string
    siteEntryCurl?: string
    searchKeyword?: string
    sourceId?: string
    sourceName?: string
    tags?: string[]
    fetchMode?: string
    fetchProvider?: string
    fetchServiceUrl?: string
    fetchEngine?: string
    fetchSessionKey?: string
    structuredHints?: import('@/api/sync').SourceRuleHints
    freeTextHints?: string
  }): Promise<boolean>
  clearSourceBuildPreview(): void
  loadFromConfig(): void
  saveToConfig(): void
}
