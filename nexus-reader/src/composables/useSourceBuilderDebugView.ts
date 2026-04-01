import { computed, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { useMessage } from '@/composables/useMessage'
import { getLocalStorageItem, setLocalStorageItem } from '@/utils/browserStorage'
import { useSettingsStore } from '@/stores/settings'
import { useSourceStore } from '@/stores/source'
import {
  syncApi,
  type FetchHtmlResponse,
  type FetchSessionProfile,
  type NxsSourcePackageDetail,
  type SourceBuildDiagnostics,
  type SourceFetchDebugInfo,
  type SourceRuleHints,
  type SourceValidationStepReport,
} from '@/api/sync'

type RefineSuggestion = {
  id: string
  step: string
  title: string
  detail: string
  kind: 'structured' | 'free_text' | 'fetch'
  applyLabel: string
  apply: () => void
}

type SourceBuilderDebugSnapshot = {
  id: string
  kind: 'build' | 'validate' | 'refine' | 'fetch_html' | 'session_import'
  createdAtMs: number
  title: string
  sourceLabel?: string
  sessionKey?: string
  bookCurl?: string
  chapterCurl?: string
  searchCurl?: string
  searchKeyword?: string
  packageData?: NxsSourcePackageDetail | null
  packageJson?: string
  diagnostics?: SourceBuildDiagnostics | null
  validationReport?: unknown
  fetchDebug?: SourceFetchDebugInfo | null
  fetchHtmlPreview?: FetchHtmlResponse | null
}

const SOURCE_BUILDER_SNAPSHOT_KEY = 'source-builder-debug-snapshots'
const SOURCE_BUILDER_SNAPSHOT_LIMIT = 20

export function useSourceBuilderDebugView() {
  const router = useRouter()
  const { success, warning } = useMessage()
  const settingsStore = useSettingsStore()
  const sourceStore = useSourceStore()
  const {
    sourcePackagesLoading,
    sourcePackageImporting,
    sourcePackageDetailLoading,
    sourceBuildRunning,
    sourcePackages,
    sourcePackageDetail,
    sourceBuildPreview,
    sourceBuildPreviewSummary,
  } = storeToRefs(settingsStore)

  const bookCurl = ref('')
  const chapterCurl = ref('')
  const searchCurl = ref('')
  const siteEntryCurl = ref('')
  const searchKeyword = ref('')
  const sourceId = ref('')
  const sourceName = ref('')
  const tagsText = ref('')

  const validateSearchQuery = ref('')
  const validateBookUrl = ref('')
  const validateTocUrl = ref('')
  const validateChapterUrl = ref('')
  const validationReport = ref<unknown>(null)
  const validationLoading = ref(false)
  const fetchMode = ref('replay')
  const fetchProvider = ref('curl_replay')
  const fetchServiceUrl = ref('')
  const fetchEngine = ref('')
  const fetchSessionKey = ref('')
  const sessionCookiesText = ref('')
  const sessionHeadersText = ref('')
  const sessionLabel = ref('')
  const sessionTtlSeconds = ref(3600)
  const sessionLoading = ref(false)
  const currentFetchSession = ref<FetchSessionProfile | null>(null)
  const fetchHtmlPreview = ref<FetchHtmlResponse | null>(null)
  const fetchHtmlUrl = ref('')
  const fetchHtmlMethod = ref('GET')
  const fetchHtmlBody = ref('')
  const fetchHtmlForceRefresh = ref(false)
  const fetchHtmlLoading = ref(false)
  const fetchHtmlError = ref('')
  const structuredHints = ref<SourceRuleHints>({
    noisePatterns: [],
  })
  const freeTextHints = ref('')
  const refineLoading = ref(false)
  const refineAutoActions = ref<string[]>([])
  const refineAppliedHints = ref<string[]>([])
  const refineChanges = ref<Array<{ path: string; before?: string | null; after?: string | null }>>([])

  const runSearchQuery = ref('')
  const runTargetUrl = ref('')
  const runResult = ref<unknown>(null)
  const runLoading = ref(false)
  const lastFetchDebug = ref<SourceFetchDebugInfo | null>(null)
  const previewPackage = ref<NxsSourcePackageDetail | null>(null)
  const previewPackageJson = ref('')
  const previewDiagnostics = ref<SourceBuildDiagnostics | null>(null)
  const debugSnapshots = ref<SourceBuilderDebugSnapshot[]>([])

  const currentPackage = computed(
    () => previewPackage.value || sourcePackageDetail.value || null
  )

  const currentPackageJson = computed(
    () => previewPackageJson.value || sourceBuildPreviewSummary.value.packageJson || ''
  )

  const currentDiagnosticsItems = computed(() => {
    const diagnostics = previewDiagnostics.value
    if (!diagnostics) {
      return sourceBuildPreviewSummary.value.diagnosticsItems
    }
    return [
      `host: ${diagnostics.host}`,
      `book sample: ${diagnostics.bookSampleUrl}`,
      `chapter sample: ${diagnostics.chapterSampleUrl}`,
      `search strategy: ${diagnostics.searchStrategy}`,
      `fetch mode: ${diagnostics.fetchMode}`,
      `fetch provider: ${diagnostics.fetchProvider}`,
      ...(diagnostics.fetchServiceUrl ? [`fetch service: ${diagnostics.fetchServiceUrl}`] : []),
      `book fetch: ${diagnostics.bookFetchStatus} -> ${diagnostics.bookFinalUrl}`,
      `chapter fetch: ${diagnostics.chapterFetchStatus} -> ${diagnostics.chapterFinalUrl}`,
      ...(diagnostics.failureCategories.length > 0
        ? [`failure categories: ${diagnostics.failureCategories.join(', ')}`]
        : []),
      `generalization: ${Math.round((diagnostics.generalizationScore ?? 0) * 100)}`,
      `same-site candidates: ${diagnostics.sameSiteCandidateCount ?? 0}`,
      ...(diagnostics.sameSiteValidationScore != null
        ? [`same-site validation: ${Math.round(diagnostics.sameSiteValidationScore * 100)}`]
        : []),
      ...(diagnostics.sameSiteValidatedUrl
        ? [`same-site validated url: ${diagnostics.sameSiteValidatedUrl}`]
        : []),
      ...(diagnostics.searchInferenceScore != null
        ? [`search inference: ${Math.round(diagnostics.searchInferenceScore * 100)}`]
        : []),
      ...(diagnostics.searchDetailPassed != null
        ? [`search detail: ${diagnostics.searchDetailPassed ? 'pass' : 'fail'}`]
        : []),
      ...(diagnostics.searchDetailFailureCode
        ? [`search detail code: ${diagnostics.searchDetailFailureCode}`]
        : []),
      ...(diagnostics.searchDetailSummary
        ? [`search detail summary: ${diagnostics.searchDetailSummary}`]
        : []),
      ...(diagnostics.searchDetailValidatedUrl
        ? [`search detail url: ${diagnostics.searchDetailValidatedUrl}`]
        : []),
      ...(diagnostics.searchDetailResolvedName
        ? [`search detail name: ${diagnostics.searchDetailResolvedName}`]
        : []),
      ...(currentPackage.value?.metadata?.['probe.searchItemNameSelector']
        ? [`search item.name: ${currentPackage.value.metadata['probe.searchItemNameSelector']}`]
        : []),
      ...(currentPackage.value?.metadata?.['probe.searchItemUrlSelector']
        ? [`search item.url: ${currentPackage.value.metadata['probe.searchItemUrlSelector']}`]
        : []),
      ...(currentPackage.value?.metadata?.['probe.searchResultFilter']
        ? [`search result filter: ${currentPackage.value.metadata['probe.searchResultFilter']}`]
        : []),
      ...(currentPackage.value?.metadata?.['probe.searchNextPageSelector']
        ? [`search next page: ${currentPackage.value.metadata['probe.searchNextPageSelector']}`]
        : []),
      ...(currentPackage.value?.metadata?.['probe.searchItemAuthorSelector']
        ? [`search item.author: ${currentPackage.value.metadata['probe.searchItemAuthorSelector']}`]
        : []),
      ...(currentPackage.value?.metadata?.['probe.searchItemIntroSelector']
        ? [`search item.intro: ${currentPackage.value.metadata['probe.searchItemIntroSelector']}`]
        : []),
      ...diagnostics.searchDetailWarnings.map(item => `search-detail warn: ${item}`),
      ...diagnostics.sameSiteValidationWarnings.map(item => `same-site warn: ${item}`),
      ...diagnostics.suggestedFixes.map(item => `fix: ${item}`),
    ]
  })

  const currentPreviewSummary = computed(() => {
    const pkg = currentPackage.value
    return {
      hasPreview: Boolean(pkg),
      sourceLabel: pkg ? `${pkg.source.name} (${pkg.source.id})` : '--',
      packageId: pkg?.packageId ?? '--',
      validationLabel: pkg?.validation
        ? `${pkg.validation.valid ? '通过' : '失败'} / ${Math.round((pkg.validation.score ?? 0) * 100)}`
        : '--',
      importable: Boolean(pkg?.validation?.importable),
    }
  })

  const validationStepSummary = computed<SourceValidationStepReport[]>(() => {
    const report = (validationReport.value as { report?: { steps?: SourceValidationStepReport[] } } | null)?.report
    const steps = report?.steps
    if (Array.isArray(steps) && steps.length > 0) {
      return steps
    }
    return currentPackage.value?.validation?.steps ?? []
  })

  const fetchDebugSummary = computed(() => {
    const debug = lastFetchDebug.value
    if (!debug) {
      return []
    }
    return [
      `mode: ${debug.mode}`,
      `provider: ${debug.provider}`,
      ...(debug.serviceUrl ? [`service: ${debug.serviceUrl}`] : []),
      ...(debug.engine ? [`engine: ${debug.engine}`] : []),
      ...(debug.sessionKey ? [`session: ${debug.sessionKey}`] : []),
      `cache hit: ${debug.cacheHit ? 'yes' : 'no'}`,
      ...(debug.sessionState ? [`session state: ${debug.sessionState}`] : []),
      ...(debug.requestUrl ? [`request: ${debug.requestUrl}`] : []),
      ...(debug.finalUrl ? [`final: ${debug.finalUrl}`] : []),
      ...(debug.httpStatus != null ? [`status: ${debug.httpStatus}`] : []),
    ]
  })

  const searchProfileSummary = computed(() => {
    const profile = currentPackage.value?.searchProfile
    if (!profile) {
      return []
    }

    return profile.strategies.map(strategy => ({
      id: strategy.id,
      mode: strategy.mode,
      enabled: strategy.enabled,
      priority: strategy.priority,
      provider: strategy.provider,
      note:
        strategy.disabledReason ||
        (strategy.pagination?.enabled && strategy.pagination.nextPageSelector
          ? `next=${strategy.pagination.nextPageSelector}`
          : null) ||
        strategy.queryTemplate ||
        strategy.detailUrlTemplate ||
        '--',
    }))
  })

  const fetchProfileSummary = computed(() => {
    const profile = currentPackage.value?.fetchProfile
    if (!profile) {
      return '--'
    }
    const parts = [profile.mode, profile.provider]
    if (profile.serviceUrl) {
      parts.push(profile.serviceUrl)
    }
    if (profile.engine) {
      parts.push(`engine=${profile.engine}`)
    }
    if (profile.sessionKey) {
      parts.push(`session=${profile.sessionKey}`)
    }
    return parts.join(' · ')
  })

  const fetchSessionSummary = computed(() => {
    const session = currentFetchSession.value
    if (!session) {
      return []
    }
    return [
      `session: ${session.sessionKey}`,
      ...(session.label ? [`label: ${session.label}`] : []),
      `cookies: ${Object.keys(session.cookies || {}).length}`,
      `headers: ${Object.keys(session.headers || {}).length}`,
      `hits: ${session.hitCount}`,
      `expires: ${new Date(session.expiresAtMs).toLocaleString()}`,
    ]
  })

  const fetchHtmlPreviewSummary = computed(() => {
    const preview = fetchHtmlPreview.value
    if (!preview) {
      return []
    }
    return [
      `status: ${preview.status}`,
      `final: ${preview.finalUrl}`,
      `cache hit: ${preview.cacheHit ? 'yes' : 'no'}`,
      `cache source: ${preview.cacheSource}`,
      ...(preview.cachedAtMs != null
        ? [`cached at: ${new Date(preview.cachedAtMs).toLocaleString()}`]
        : []),
      ...(preview.expiresAtMs != null
        ? [`expires at: ${new Date(preview.expiresAtMs).toLocaleString()}`]
        : []),
      ...(preview.ttlRemainingMs != null
        ? [`ttl remaining: ${Math.max(0, Math.round(preview.ttlRemainingMs / 1000))}s`]
        : []),
      `session state: ${preview.sessionState}`,
      `html chars: ${preview.html.length}`,
    ]
  })

  const debugSnapshotSummary = computed(() =>
    debugSnapshots.value.map(item => ({
      id: item.id,
      kind: item.kind,
      title: item.title,
      subtitle: [
        item.sourceLabel || '--',
        new Date(item.createdAtMs).toLocaleString(),
        item.sessionKey ? `session=${item.sessionKey}` : '',
      ]
        .filter(Boolean)
        .join(' · '),
    }))
  )

  watch(
    currentPackage,
    value => {
      const samples = value?.samples
      if (!samples) {
        return
      }
      validateBookUrl.value = samples.bookSampleUrl || validateBookUrl.value
      validateChapterUrl.value = samples.chapterSampleUrl || validateChapterUrl.value
      runTargetUrl.value = samples.chapterSampleUrl || samples.bookSampleUrl || runTargetUrl.value
      fetchHtmlUrl.value = samples.bookSampleUrl || fetchHtmlUrl.value
      runSearchQuery.value = searchKeyword.value || runSearchQuery.value
    },
    { immediate: true }
  )

  watch(
    sourceBuildPreview,
    value => {
      previewPackage.value = value?.package ?? null
      previewPackageJson.value = value?.packageJson ?? ''
      previewDiagnostics.value = value?.diagnostics ?? null
    },
    { immediate: true }
  )

  function parseCookieText(input: string) {
    return input
      .split(/[\n;]+/)
      .map(item => item.trim())
      .filter(Boolean)
      .reduce<Record<string, string>>((acc, item) => {
        const index = item.indexOf('=')
        if (index <= 0) {
          return acc
        }
        const key = item.slice(0, index).trim()
        const value = item.slice(index + 1).trim()
        if (key) {
          acc[key] = value
        }
        return acc
      }, {})
  }

  function parseHeadersText(input: string) {
    const trimmed = input.trim()
    if (!trimmed) {
      return {}
    }
    if (trimmed.startsWith('{')) {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>
      return Object.fromEntries(
        Object.entries(parsed)
          .filter(([, value]) => value != null)
          .map(([key, value]) => [key, String(value)])
      )
    }
    return trimmed
      .split('\n')
      .map(item => item.trim())
      .filter(Boolean)
      .reduce<Record<string, string>>((acc, item) => {
        const index = item.indexOf(':')
        if (index <= 0) {
          return acc
        }
        const key = item.slice(0, index).trim()
        const value = item.slice(index + 1).trim()
        if (key) {
          acc[key] = value
        }
        return acc
      }, {})
  }

  function persistDebugSnapshots() {
    try {
      setLocalStorageItem(
        SOURCE_BUILDER_SNAPSHOT_KEY,
        JSON.stringify(debugSnapshots.value)
      )
    } catch {
      // ignore persistence failures
    }
  }

  function loadDebugSnapshots() {
    try {
      const raw = getLocalStorageItem(SOURCE_BUILDER_SNAPSHOT_KEY)
      if (!raw) {
        debugSnapshots.value = []
        return
      }
      const parsed = JSON.parse(raw) as SourceBuilderDebugSnapshot[]
      debugSnapshots.value = Array.isArray(parsed) ? parsed : []
    } catch {
      debugSnapshots.value = []
    }
  }

  function pushDebugSnapshot(snapshot: Omit<SourceBuilderDebugSnapshot, 'id' | 'createdAtMs'>) {
    debugSnapshots.value = [
      {
        id: `${snapshot.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAtMs: Date.now(),
        ...snapshot,
      },
      ...debugSnapshots.value,
    ].slice(0, SOURCE_BUILDER_SNAPSHOT_LIMIT)
    persistDebugSnapshots()
  }

  function restoreDebugSnapshot(snapshotId: string) {
    const snapshot = debugSnapshots.value.find(item => item.id === snapshotId)
    if (!snapshot) {
      warning('快照不存在')
      return
    }

    if (snapshot.bookCurl != null) {
      bookCurl.value = snapshot.bookCurl
    }
    if (snapshot.chapterCurl != null) {
      chapterCurl.value = snapshot.chapterCurl
    }
    if (snapshot.searchCurl != null) {
      searchCurl.value = snapshot.searchCurl
    }
    if (snapshot.searchKeyword != null) {
      searchKeyword.value = snapshot.searchKeyword
    }
    if (snapshot.sessionKey != null) {
      fetchSessionKey.value = snapshot.sessionKey
    }
    previewPackage.value = snapshot.packageData ?? null
    previewPackageJson.value = snapshot.packageJson ?? ''
    previewDiagnostics.value = snapshot.diagnostics ?? null
    validationReport.value = snapshot.validationReport ?? null
    lastFetchDebug.value = snapshot.fetchDebug ?? null
    fetchHtmlPreview.value = snapshot.fetchHtmlPreview ?? null
    success(`已恢复快照: ${snapshot.title}`)
  }

  function clearDebugSnapshots() {
    debugSnapshots.value = []
    persistDebugSnapshots()
  }

  async function refreshPackages() {
    await Promise.allSettled([
      settingsStore.refreshSourcePackages(),
      sourceStore.loadSources(true),
    ])
  }

  async function importFetchSession() {
    if (!fetchSessionKey.value.trim()) {
      warning('请先填写 session key')
      return
    }

    sessionLoading.value = true
    try {
      const response = await syncApi.importFetchSession({
        sessionKey: fetchSessionKey.value.trim(),
        ...(sessionLabel.value.trim() ? { label: sessionLabel.value.trim() } : {}),
        cookies: parseCookieText(sessionCookiesText.value),
        headers: parseHeadersText(sessionHeadersText.value),
        ttlSeconds: Math.max(60, Number(sessionTtlSeconds.value) || 3600),
      })
      if (!response.isSuccess || !response.data) {
        warning(response.errorMsg || '导入 session 失败')
        return
      }
      currentFetchSession.value = response.data.session
      pushDebugSnapshot({
        kind: 'session_import',
        title: 'Session imported',
        sourceLabel: currentPackage.value
          ? `${currentPackage.value.source.name} (${currentPackage.value.source.id})`
          : undefined,
        sessionKey: response.data.session.sessionKey,
        packageData: currentPackage.value,
        packageJson: currentPackageJson.value || undefined,
        diagnostics: previewDiagnostics.value,
        validationReport: validationReport.value,
        fetchDebug: lastFetchDebug.value,
        fetchHtmlPreview: fetchHtmlPreview.value,
      })
      success('session 已导入')
    } catch {
      warning('导入 session 失败')
    } finally {
      sessionLoading.value = false
    }
  }

  async function loadFetchSession() {
    if (!fetchSessionKey.value.trim()) {
      warning('请先填写 session key')
      return
    }

    sessionLoading.value = true
    try {
      const response = await syncApi.getFetchSession(fetchSessionKey.value.trim())
      if (!response.isSuccess || !response.data) {
        warning(response.errorMsg || '读取 session 失败')
        return
      }
      currentFetchSession.value = response.data
      success('session 已加载')
    } catch {
      warning('读取 session 失败')
    } finally {
      sessionLoading.value = false
    }
  }

  async function previewFetchHtml() {
    if (!fetchHtmlUrl.value.trim()) {
      warning('请先填写待抓取 URL')
      return
    }

    fetchHtmlLoading.value = true
    fetchHtmlError.value = ''
    try {
      const response = await syncApi.fetchHtmlWithSession({
        url: fetchHtmlUrl.value.trim(),
        method: fetchHtmlMethod.value.trim() || 'GET',
        ...(fetchHtmlBody.value.trim() ? { body: fetchHtmlBody.value } : {}),
        ...(fetchSessionKey.value.trim() ? { sessionKey: fetchSessionKey.value.trim() } : {}),
        forceRefresh: fetchHtmlForceRefresh.value,
        headers: parseHeadersText(sessionHeadersText.value),
      })
      if (!response.isSuccess || !response.data) {
        fetchHtmlError.value = response.errorMsg || '预抓取 HTML 失败'
        warning(fetchHtmlError.value)
        return
      }
      fetchHtmlPreview.value = response.data
      lastFetchDebug.value = response.data.fetchDebug
      pushDebugSnapshot({
        kind: 'fetch_html',
        title: 'Fetch HTML preview',
        sourceLabel: currentPackage.value
          ? `${currentPackage.value.source.name} (${currentPackage.value.source.id})`
          : undefined,
        sessionKey: fetchSessionKey.value.trim() || undefined,
        packageData: currentPackage.value,
        packageJson: currentPackageJson.value || undefined,
        diagnostics: previewDiagnostics.value,
        validationReport: validationReport.value,
        fetchDebug: response.data.fetchDebug,
        fetchHtmlPreview: response.data,
      })
      success('HTML 预抓取完成')
    } catch {
      fetchHtmlError.value = '预抓取 HTML 失败'
      warning('预抓取 HTML 失败')
    } finally {
      fetchHtmlLoading.value = false
    }
  }

  async function buildFromSamples() {
    if (!bookCurl.value.trim() || !chapterCurl.value.trim()) {
      warning('请至少提供 book curl 和 chapter curl')
      return
    }

    const ok = await settingsStore.buildSourcePackageFromSamples({
      bookCurl: bookCurl.value,
      chapterCurl: chapterCurl.value,
      ...(searchCurl.value.trim() ? { searchCurl: searchCurl.value } : {}),
      ...(siteEntryCurl.value.trim() ? { siteEntryCurl: siteEntryCurl.value } : {}),
      ...(searchKeyword.value.trim() ? { searchKeyword: searchKeyword.value } : {}),
      ...(sourceId.value.trim() ? { sourceId: sourceId.value.trim() } : {}),
      ...(sourceName.value.trim() ? { sourceName: sourceName.value.trim() } : {}),
      fetchMode: fetchMode.value,
      fetchProvider: fetchProvider.value,
      ...(fetchServiceUrl.value.trim() ? { fetchServiceUrl: fetchServiceUrl.value.trim() } : {}),
      ...(fetchEngine.value.trim() ? { fetchEngine: fetchEngine.value.trim() } : {}),
      ...(fetchSessionKey.value.trim() ? { fetchSessionKey: fetchSessionKey.value.trim() } : {}),
      structuredHints:
        hasStructuredHints.value ? { ...structuredHints.value } : undefined,
      ...(freeTextHints.value.trim() ? { freeTextHints: freeTextHints.value.trim() } : {}),
      tags: tagsText.value
        .split(',')
        .map(item => item.trim())
        .filter(Boolean),
    })
    if (ok) {
      pushDebugSnapshot({
        kind: 'build',
        title: 'Build source package',
        sourceLabel: previewPackage.value
          ? `${previewPackage.value.source.name} (${previewPackage.value.source.id})`
          : undefined,
        sessionKey: fetchSessionKey.value.trim() || undefined,
        bookCurl: bookCurl.value,
        chapterCurl: chapterCurl.value,
        searchCurl: searchCurl.value,
        searchKeyword: searchKeyword.value,
        packageData: previewPackage.value,
        packageJson: previewPackageJson.value || undefined,
        diagnostics: previewDiagnostics.value,
        validationReport: validationReport.value,
        fetchDebug: lastFetchDebug.value,
        fetchHtmlPreview: fetchHtmlPreview.value,
      })
      success('规则包预览已生成')
    } else {
      warning('构建失败')
    }
  }

  async function importPreviewPackage() {
    const packageJson = currentPackageJson.value
    if (!packageJson) {
      warning('当前没有可导入的预览包')
      return
    }
    if (!currentPackage.value?.validation?.importable) {
      warning('当前规则包尚未通过验证，不能导入')
      return
    }
    const ok = await settingsStore.importSourcePackage(packageJson)
    if (ok) {
      await refreshPackages()
      success('预览包已导入')
    } else {
      warning('导入失败')
    }
  }

  async function selectPackage(sourceId: string) {
    await settingsStore.loadSourcePackageDetail(sourceId)
  }

  async function validateCurrentPackage() {
    if (!currentPackage.value) {
      warning('当前没有可验证的规则包')
      return
    }

    validationLoading.value = true
    try {
      const response = await syncApi.validateSourcePackage(currentPackage.value, {
        ...(validateSearchQuery.value.trim()
          ? { searchQuery: validateSearchQuery.value.trim() }
          : {}),
        ...(validateBookUrl.value.trim() ? { bookUrl: validateBookUrl.value.trim() } : {}),
        ...(validateTocUrl.value.trim() ? { tocUrl: validateTocUrl.value.trim() } : {}),
        ...(validateChapterUrl.value.trim()
          ? { chapterUrl: validateChapterUrl.value.trim() }
          : {}),
      })
      validationReport.value = response.data ?? null
      if (response.isSuccess) {
        lastFetchDebug.value = response.data?.fetchDebug ?? null
        if (previewPackage.value && response.data?.report) {
          previewPackage.value = {
            ...previewPackage.value,
            validation: response.data.report,
          }
          previewPackageJson.value = JSON.stringify(previewPackage.value, null, 2)
        }
        pushDebugSnapshot({
          kind: 'validate',
          title: 'Validate package',
          sourceLabel: currentPackage.value
            ? `${currentPackage.value.source.name} (${currentPackage.value.source.id})`
            : undefined,
          sessionKey: fetchSessionKey.value.trim() || undefined,
          bookCurl: bookCurl.value,
          chapterCurl: chapterCurl.value,
          searchCurl: searchCurl.value,
          searchKeyword: searchKeyword.value,
          packageData: previewPackage.value ?? currentPackage.value,
          packageJson: currentPackageJson.value || undefined,
          diagnostics: previewDiagnostics.value,
          validationReport: response.data,
          fetchDebug: response.data?.fetchDebug ?? null,
          fetchHtmlPreview: fetchHtmlPreview.value,
        })
        success('验证已完成')
      } else {
        warning(response.errorMsg || '验证失败')
      }
    } catch {
      warning('验证失败')
    } finally {
      validationLoading.value = false
    }
  }

  async function runOperation(operation: 'search' | 'book_info' | 'chapters' | 'content') {
    if (!currentPackage.value) {
      warning('当前没有可调试的规则包')
      return
    }

    runLoading.value = true
    try {
      const payload =
        operation === 'search'
          ? {
              package: currentPackage.value,
              operation,
              query: runSearchQuery.value.trim(),
            }
          : {
              package: currentPackage.value,
              operation,
              targetUrl: runTargetUrl.value.trim(),
            }

      const response = await syncApi.runEngineByPackage(payload)
      runResult.value = response.data ?? null
      if (response.isSuccess) {
        lastFetchDebug.value = response.data?.fetchDebug ?? null
        success(`已执行 ${operation}`)
      } else {
        warning(response.errorMsg || `${operation} 执行失败`)
      }
    } catch {
      warning(`${operation} 执行失败`)
    } finally {
      runLoading.value = false
    }
  }

  const hasStructuredHints = computed(() => {
    const value = structuredHints.value
    return Boolean(
      value.searchEntry ||
        value.searchResultSelector ||
        value.bookTitleSelector ||
        value.authorSelector ||
        value.introSelector ||
        value.tocItemSelector ||
        value.contentSelector ||
        value.contentTitleSelector ||
        value.paginationSelector ||
        value.noisePatterns.length > 0
    )
  })

  function mergeNoisePatterns(patterns: string[]) {
    structuredHints.value.noisePatterns = Array.from(
      new Set([
        ...(structuredHints.value.noisePatterns ?? []),
        ...patterns.map(item => item.trim()).filter(Boolean),
      ])
    )
  }

  function appendFreeTextHint(line: string) {
    const trimmed = line.trim()
    if (!trimmed) {
      return
    }
    const lines = freeTextHints.value
      .split('\n')
      .map(item => item.trim())
      .filter(Boolean)
    if (!lines.includes(trimmed)) {
      lines.push(trimmed)
      freeTextHints.value = lines.join('\n')
    }
  }

  const refineSuggestions = computed<RefineSuggestion[]>(() => {
    const pkg = currentPackage.value
    const steps = validationStepSummary.value
    if (!pkg || steps.length === 0) {
      return []
    }

    const suggestions: RefineSuggestion[] = []

    for (const step of steps) {
      const code = step.failureCode ?? ''
      if (step.step === 'search' && code === 'empty_result') {
        suggestions.push({
          id: 'search-selector-fallback',
          step: step.step,
          title: '补充搜索结果选择器兜底',
          detail: '把常见搜索列表选择器预填到 structured hints，优先修正 search result selector。',
          kind: 'structured',
          applyLabel: '填充 search selector',
          apply: () => {
            structuredHints.value.searchResultSelector =
              '.bookbox | .result-item | .search-item | li | a[href]'
          },
        })
      }

      if (step.step === 'search' && (code === 'fetch_failed' || code === 'fetch_timeout')) {
        suggestions.push({
          id: 'search-fetch-session',
          step: step.step,
          title: '改用人工 Session 抓取',
          detail: '当前搜索抓取失败，优先检查并导入 session，再复用到 build/validate 流程。',
          kind: 'fetch',
          applyLabel: '切到 human session',
          apply: () => {
            fetchMode.value = 'human_session'
            fetchProvider.value = 'session_replay'
          },
        })
      }

      if (step.step === 'book_info' && code === 'selector_miss') {
        suggestions.push({
          id: 'book-title-author-fallback',
          step: step.step,
          title: '补充书名/作者选择器',
          detail: 'book_info 命中为空时，先把常见标题和作者选择器写入 structured hints。',
          kind: 'structured',
          applyLabel: '填充 book selectors',
          apply: () => {
            structuredHints.value.bookTitleSelector = 'h1 | .book-title | .title | meta[property=\'og:title\']'
            structuredHints.value.authorSelector = '.author | .book-author | .info .author'
          },
        })
      }

      if (
        step.step === 'search_detail' &&
        ['detail_mismatch', 'detail_cross_site', 'detail_fetch_failed', 'detail_selector_miss'].includes(code)
      ) {
        suggestions.push({
          id: 'search-detail-url-fallback',
          step: step.step,
          title: '修正搜索详情链接提取',
          detail: '搜索结果能出来，但跳到详情页失败，优先修正 search item url selector 或增加结果过滤。',
          kind: 'structured',
          applyLabel: '填充 url selector',
          apply: () => {
            structuredHints.value.searchResultSelector =
              '.search-list > li | .result-list li | .book-list li | .bookbox | .result-item'
            appendFreeTextHint('search result selector: .search-list > li')
            appendFreeTextHint('search result selector: .result-list li')
          },
        })
        suggestions.push({
          id: 'search-detail-free-text',
          step: step.step,
          title: '补充搜索结果说明',
          detail: '显式告诉 refine 哪个元素才是书籍详情链接，而不是作者页、最新章节页或导航链接。',
          kind: 'free_text',
          applyLabel: '追加 free text',
          apply: () => {
            appendFreeTextHint('search result: 选择每本书结果卡片，不要选择分页或导航')
            appendFreeTextHint('book title: 搜索结果中的书名链接就是详情页入口')
          },
        })
        if (code === 'detail_cross_site') {
          suggestions.push({
            id: 'search-detail-cross-site-filter',
            step: step.step,
            title: '收紧搜索结果过滤',
            detail: '当前搜索结果疑似跳到了跨站页、作者页或榜单页，应补充 result_filter 约束路径。',
            kind: 'free_text',
            applyLabel: '追加 filter 提示',
            apply: () => {
              appendFreeTextHint('search result: 只保留书籍详情页，不要作者页、章节页、排行页')
            },
          })
        }
        if (code === 'detail_selector_miss') {
          suggestions.push({
            id: 'search-detail-book-selectors',
            step: step.step,
            title: '修正详情页书籍选择器',
            detail: '详情页能打开但书名规则不命中，优先补 book title / author selector。',
            kind: 'structured',
            applyLabel: '填充详情 selectors',
            apply: () => {
              structuredHints.value.bookTitleSelector =
                'h1 | .book-title | .title | .info h1 | meta[property=\'og:title\']'
              structuredHints.value.authorSelector =
                '.author | .book-author | .info .author | p.author'
            },
          })
        }
      }

      if (step.step === 'chapters' && code === 'empty_result') {
        suggestions.push({
          id: 'toc-selector-fallback',
          step: step.step,
          title: '补充目录选择器',
          detail: '目录为空时，优先扩宽 toc item selector，而不是直接改内容规则。',
          kind: 'structured',
          applyLabel: '填充 toc selector',
          apply: () => {
            structuredHints.value.tocItemSelector = '.chapter-list a | #list a | .catalog a | a[href]'
          },
        })
      }

      if (step.step === 'content' && (code === 'low_quality' || code === 'manual_review')) {
        suggestions.push({
          id: `content-selector-${code}`,
          step: step.step,
          title: '补充正文选择器兜底',
          detail: '正文质量低时，先收窄 content selector 到常见正文容器，再做噪音过滤。',
          kind: 'structured',
          applyLabel: '填充 content selector',
          apply: () => {
            structuredHints.value.contentSelector =
              '#content | .content | .txtnav | .read-content | article'
          },
        })
        suggestions.push({
          id: `content-noise-${code}`,
          step: step.step,
          title: '补充正文噪音规则',
          detail: '对广告、最新网址、推广、手机阅读等常见污染词先加清洗规则。',
          kind: 'structured',
          applyLabel: '填充 noise patterns',
          apply: () => {
            mergeNoisePatterns(['最新网址', '推广', '广告', '手机阅读', '收藏本站'])
          },
        })
        suggestions.push({
          id: `content-free-text-${code}`,
          step: step.step,
          title: '补一条自由文本提示',
          detail: '当页面结构特殊时，给 refine 一条显式说明，避免只靠 fallback。',
          kind: 'free_text',
          applyLabel: '追加 free text',
          apply: () => {
            appendFreeTextHint('content selector: #content')
            appendFreeTextHint('noise pattern: 最新网址')
          },
        })
      }
    }

    return suggestions.filter(
      (item, index, list) => list.findIndex(candidate => candidate.id === item.id) === index
    )
  })

  function applyRefineSuggestion(suggestion: RefineSuggestion) {
    suggestion.apply()
    success(`已填充建议: ${suggestion.title}`)
  }

  async function executeRefinePackage(successMessage: string) {
    if (!currentPackage.value) {
      warning('当前没有可修正的规则包')
      return
    }
    const hasAutoRefineSignal = (currentPackage.value.validation?.steps ?? []).some(
      step => Boolean(step.failureCode) || step.manualReviewRecommended
    )
    if (!hasStructuredHints.value && !freeTextHints.value.trim() && !hasAutoRefineSignal) {
      warning('当前没有可用提示，也没有可自动修正的失败分类')
      return
    }

    refineLoading.value = true
    try {
      const response = await syncApi.refineSourcePackage({
        package: currentPackage.value,
        ...(hasStructuredHints.value ? { structuredHints: { ...structuredHints.value } } : {}),
        ...(freeTextHints.value.trim() ? { freeTextHints: freeTextHints.value.trim() } : {}),
        samples: {
          ...(validateSearchQuery.value.trim() ? { searchQuery: validateSearchQuery.value.trim() } : {}),
          ...(validateBookUrl.value.trim() ? { bookUrl: validateBookUrl.value.trim() } : {}),
          ...(validateTocUrl.value.trim() ? { tocUrl: validateTocUrl.value.trim() } : {}),
          ...(validateChapterUrl.value.trim() ? { chapterUrl: validateChapterUrl.value.trim() } : {}),
        },
        emitPackageJson: true,
      })
      if (!response.isSuccess || !response.data) {
        warning(response.errorMsg || '规则修正失败')
        return
      }
      previewPackage.value = response.data.package
      previewPackageJson.value = response.data.packageJson ?? JSON.stringify(response.data.package, null, 2)
      refineAutoActions.value = response.data.autoAppliedActions
      refineAppliedHints.value = response.data.appliedHints
      refineChanges.value = response.data.changes ?? []
      validationReport.value = {
        packageId: response.data.package.packageId,
        report: response.data.package.validation,
      }
      lastFetchDebug.value = response.data.package.fetchProfile
        ? {
            mode: response.data.package.fetchProfile.mode,
            provider: response.data.package.fetchProfile.provider,
            serviceUrl: response.data.package.fetchProfile.serviceUrl,
            engine: response.data.package.fetchProfile.engine,
            sessionKey: response.data.package.fetchProfile.sessionKey,
            cacheHit: false,
            sessionState: response.data.package.fetchProfile.sessionKey ? 'active' : 'none',
          }
        : null
      pushDebugSnapshot({
        kind: 'refine',
        title: 'Refine package',
        sourceLabel: response.data.package
          ? `${response.data.package.source.name} (${response.data.package.source.id})`
          : undefined,
        sessionKey: fetchSessionKey.value.trim() || undefined,
        bookCurl: bookCurl.value,
        chapterCurl: chapterCurl.value,
        searchCurl: searchCurl.value,
        searchKeyword: searchKeyword.value,
        packageData: response.data.package,
        packageJson: previewPackageJson.value || undefined,
        diagnostics: previewDiagnostics.value,
        validationReport: {
          packageId: response.data.package.packageId,
          report: response.data.package.validation,
        },
        fetchDebug: lastFetchDebug.value,
        fetchHtmlPreview: fetchHtmlPreview.value,
      })
      success(successMessage)
    } catch {
      warning('规则修正失败')
    } finally {
      refineLoading.value = false
    }
  }

  async function refineCurrentPackage() {
    await executeRefinePackage('规则已根据提示修正并重新验证')
  }

  async function applyRefineSuggestionAndRefine(suggestion: RefineSuggestion) {
    applyRefineSuggestion(suggestion)
    await executeRefinePackage(`已应用建议并修正: ${suggestion.title}`)
  }

  function clearPreview() {
    settingsStore.clearSourceBuildPreview()
    previewPackage.value = null
    previewPackageJson.value = ''
    previewDiagnostics.value = null
    validationReport.value = null
    runResult.value = null
    lastFetchDebug.value = null
    fetchHtmlPreview.value = null
    fetchHtmlError.value = ''
    refineAutoActions.value = []
    refineAppliedHints.value = []
    refineChanges.value = []
  }

  function goBack() {
    void router.push('/settings')
  }

  onMounted(async () => {
    loadDebugSnapshots()
    await refreshPackages()
  })

  return {
    sourcePackagesLoading,
    sourcePackageImporting,
    sourcePackageDetailLoading,
    sourceBuildRunning,
    sourcePackages,
    sourceBuildPreviewSummary,
    currentPreviewSummary,
    currentPackageJson,
    currentDiagnosticsItems,
    currentPackage,
    searchProfileSummary,
    fetchProfileSummary,
    validationStepSummary,
    fetchDebugSummary,
    bookCurl,
    chapterCurl,
    searchCurl,
    siteEntryCurl,
    searchKeyword,
    sourceId,
    sourceName,
    tagsText,
    fetchMode,
    fetchProvider,
    fetchServiceUrl,
    fetchEngine,
    fetchSessionKey,
    sessionCookiesText,
    sessionHeadersText,
    sessionLabel,
    sessionTtlSeconds,
    sessionLoading,
    currentFetchSession,
    fetchSessionSummary,
    fetchHtmlPreview,
    fetchHtmlPreviewSummary,
    debugSnapshots,
    debugSnapshotSummary,
    fetchHtmlUrl,
    fetchHtmlMethod,
    fetchHtmlBody,
    fetchHtmlForceRefresh,
    fetchHtmlLoading,
    fetchHtmlError,
    structuredHints,
    freeTextHints,
    refineLoading,
    refineAutoActions,
    refineAppliedHints,
    refineChanges,
    refineSuggestions,
    validateSearchQuery,
    validateBookUrl,
    validateTocUrl,
    validateChapterUrl,
    validationReport,
    validationLoading,
    runSearchQuery,
    runTargetUrl,
    runResult,
    runLoading,
    buildFromSamples,
    importFetchSession,
    loadFetchSession,
    previewFetchHtml,
    restoreDebugSnapshot,
    clearDebugSnapshots,
    importPreviewPackage,
    refreshPackages,
    selectPackage,
    validateCurrentPackage,
    applyRefineSuggestion,
    applyRefineSuggestionAndRefine,
    refineCurrentPackage,
    runOperation,
    clearPreview,
    goBack,
  }
}
