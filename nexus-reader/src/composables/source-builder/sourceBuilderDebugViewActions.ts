import type { Ref } from 'vue'
import type {
  FetchHtmlResponse,
  NxsSourcePackageDetail,
  SourceBuildDiagnostics,
  SourceFetchDebugInfo,
  SourceRuleHints,
} from '@/api/sync'
import type { SourceBuilderDebugSnapshot } from '@/composables/source-builder/types'

type SourceBuilderStoreActions = {
  buildSourcePackageFromSamples: (payload: {
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
    structuredHints?: SourceRuleHints
    freeTextHints?: string
  }) => Promise<boolean>
}

type BuildFromSamplesOptions = {
  settingsStore: SourceBuilderStoreActions
  bookCurl: Ref<string>
  chapterCurl: Ref<string>
  searchCurl: Ref<string>
  siteEntryCurl: Ref<string>
  searchKeyword: Ref<string>
  sourceId: Ref<string>
  sourceName: Ref<string>
  tagsText: Ref<string>
  fetchMode: Ref<string>
  fetchProvider: Ref<string>
  fetchServiceUrl: Ref<string>
  fetchEngine: Ref<string>
  fetchSessionKey: Ref<string>
  structuredHints: Ref<SourceRuleHints>
  hasStructuredHints: Ref<boolean> | { value: boolean }
  freeTextHints: Ref<string>
  previewPackage: Ref<NxsSourcePackageDetail | null>
  previewPackageJson: Ref<string>
  previewDiagnostics: Ref<SourceBuildDiagnostics | null>
  validationReport: Ref<unknown>
  lastFetchDebug: Ref<SourceFetchDebugInfo | null>
  fetchHtmlPreview: Ref<FetchHtmlResponse | null>
  pushDebugSnapshot: (
    snapshot: Omit<SourceBuilderDebugSnapshot, 'id' | 'createdAtMs'>
  ) => void
  success: (message: string) => void
  warning: (message: string) => void
}

type ImportPreviewPackageOptions = {
  currentPackage: Ref<NxsSourcePackageDetail | null> | { value: NxsSourcePackageDetail | null }
  currentPackageJson: Ref<string> | { value: string }
  importSourcePackage: (packageJson: string) => Promise<boolean>
  refreshPackages: () => Promise<void>
  success: (message: string) => void
  warning: (message: string) => void
}

type ClearPreviewOptions = {
  clearSourceBuildPreview: () => void
  previewPackage: Ref<NxsSourcePackageDetail | null>
  previewPackageJson: Ref<string>
  previewDiagnostics: Ref<SourceBuildDiagnostics | null>
  runResult: Ref<unknown>
  runSearchDetailResult: Ref<unknown>
  runChaptersResult: Ref<unknown>
  lastFetchDebug: Ref<SourceFetchDebugInfo | null>
  clearFetchState: () => void
  clearRunState: () => void
  clearValidationRefineState: () => void
}

export async function refreshSourceBuilderPackages(options: {
  refreshRuntimeGovernance: () => Promise<void>
  refreshSourcePackages: () => Promise<void>
}) {
  await Promise.allSettled([options.refreshRuntimeGovernance(), options.refreshSourcePackages()])
}

export async function buildSourceBuilderFromSamples(options: BuildFromSamplesOptions) {
  if (!options.bookCurl.value.trim() || !options.chapterCurl.value.trim()) {
    options.warning('请至少提供 book curl 和 chapter curl')
    return false
  }

  const ok = await options.settingsStore.buildSourcePackageFromSamples({
    bookCurl: options.bookCurl.value,
    chapterCurl: options.chapterCurl.value,
    ...(options.searchCurl.value.trim() ? { searchCurl: options.searchCurl.value } : {}),
    ...(options.siteEntryCurl.value.trim() ? { siteEntryCurl: options.siteEntryCurl.value } : {}),
    ...(options.searchKeyword.value.trim() ? { searchKeyword: options.searchKeyword.value } : {}),
    ...(options.sourceId.value.trim() ? { sourceId: options.sourceId.value.trim() } : {}),
    ...(options.sourceName.value.trim() ? { sourceName: options.sourceName.value.trim() } : {}),
    fetchMode: options.fetchMode.value,
    fetchProvider: options.fetchProvider.value,
    ...(options.fetchServiceUrl.value.trim()
      ? { fetchServiceUrl: options.fetchServiceUrl.value.trim() }
      : {}),
    ...(options.fetchEngine.value.trim() ? { fetchEngine: options.fetchEngine.value.trim() } : {}),
    ...(options.fetchSessionKey.value.trim()
      ? { fetchSessionKey: options.fetchSessionKey.value.trim() }
      : {}),
    structuredHints: options.hasStructuredHints.value ? { ...options.structuredHints.value } : undefined,
    ...(options.freeTextHints.value.trim() ? { freeTextHints: options.freeTextHints.value.trim() } : {}),
    tags: options.tagsText.value
      .split(',')
      .map(item => item.trim())
      .filter(Boolean),
  })

  if (!ok) {
    options.warning('构建失败')
    return false
  }

  options.pushDebugSnapshot({
    kind: 'build',
    title: 'Build source package',
    sourceLabel: options.previewPackage.value
      ? `${options.previewPackage.value.source.name} (${options.previewPackage.value.source.id})`
      : undefined,
    sessionKey: options.fetchSessionKey.value.trim() || undefined,
    bookCurl: options.bookCurl.value,
    chapterCurl: options.chapterCurl.value,
    searchCurl: options.searchCurl.value,
    searchKeyword: options.searchKeyword.value,
    packageData: options.previewPackage.value,
    packageJson: options.previewPackageJson.value || undefined,
    diagnostics: options.previewDiagnostics.value,
    validationReport: options.validationReport.value,
    fetchDebug: options.lastFetchDebug.value,
    fetchHtmlPreview: options.fetchHtmlPreview.value,
  })
  options.success('规则包预览已生成')
  return true
}

export async function importSourceBuilderPreviewPackage(options: ImportPreviewPackageOptions) {
  const packageJson = options.currentPackageJson.value
  if (!packageJson) {
    options.warning('当前没有可导入的预览包')
    return
  }
  if (!options.currentPackage.value?.validation?.importable) {
    options.warning('当前规则包尚未通过验证，不能导入')
    return
  }

  const ok = await options.importSourcePackage(packageJson)
  if (!ok) {
    options.warning('导入失败')
    return
  }

  await options.refreshPackages()
  options.success('预览包已导入')
}

export async function selectSourceBuilderPackage(options: {
  sourceId: string
  loadSourcePackageDetail: (sourceId: string) => Promise<void>
}) {
  await options.loadSourcePackageDetail(options.sourceId)
}

export function clearSourceBuilderPreview(options: ClearPreviewOptions) {
  options.clearSourceBuildPreview()
  options.previewPackage.value = null
  options.previewPackageJson.value = ''
  options.previewDiagnostics.value = null
  options.runResult.value = null
  options.runSearchDetailResult.value = null
  options.runChaptersResult.value = null
  options.lastFetchDebug.value = null
  options.clearFetchState()
  options.clearRunState()
  options.clearValidationRefineState()
}
