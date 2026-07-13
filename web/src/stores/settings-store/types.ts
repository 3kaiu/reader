import type { ComputedRef, Ref, WritableComputedRef } from 'vue'
import type { NxsSourcePackageDetail, SourcePackageSummary } from '@/api/sync'
import type { ReaderConfig, ThemeColors } from '@/types/settings'

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

export interface SettingsStoreState {
  config: ReaderConfig
  language: Ref<string>
  sourcePackages: Ref<SourcePackageSummary[]>
  sourcePackagesLoading: Ref<boolean>
  sourcePackageImporting: Ref<boolean>
  sourcePackageDetail: Ref<NxsSourcePackageDetail | null>
  sourcePackageDetailLoading: Ref<boolean>
}

export interface SettingsStoreView {
  currentFontFamily: ComputedRef<string>
  themeColors: ComputedRef<ThemeColors>
  sourcePackageDetailSummary: ComputedRef<SourcePackageDetailSummary>
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
  refreshSourcePackages(): Promise<void>
  clearSourcePackages(): void
  importSourcePackage(packageJson: string): Promise<boolean>
  deleteSourcePackage(sourceId: string): Promise<boolean>
  loadSourcePackageDetail(sourceId: string): Promise<void>
  clearSourcePackageDetail(): void
  loadFromConfig(): void
  saveToConfig(): void
}
