import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { useMessage } from '@/composables/useMessage'
import { syncApi } from '@/api/sync'
import type {
  FetchHtmlResponse,
  FetchSessionProfile,
  NxsSourcePackageDetail,
  SourceBuildDiagnostics,
  SourceFetchDebugInfo,
} from '@/api/sync'
import type { SourceBuilderDebugSnapshot } from '@/composables/source-builder/types'

type UseSourceBuilderFetchSessionOptions = {
  currentPackage: ComputedRef<NxsSourcePackageDetail | null>
  currentPackageJson: ComputedRef<string>
  previewDiagnostics: Ref<SourceBuildDiagnostics | null>
  getValidationReport: () => unknown
  fetchMode: Ref<string>
  fetchProvider: Ref<string>
  fetchServiceUrl: Ref<string>
  fetchEngine: Ref<string>
  pushDebugSnapshot: (snapshot: Omit<SourceBuilderDebugSnapshot, 'id' | 'createdAtMs'>) => void
}

export function useSourceBuilderFetchSession(options: UseSourceBuilderFetchSessionOptions) {
  const { success, warning } = useMessage()

  const fetchSessionKey = ref('')
  const sessionCookiesText = ref('')
  const sessionHeadersText = ref('')
  const sessionLabel = ref('')
  const sessionTtlSeconds = ref(3600)
  const sessionLoading = ref(false)
  const currentFetchSession = ref<FetchSessionProfile | null>(null)
  const fetchHtmlPreview = ref<FetchHtmlResponse | null>(null)
  const rawFetchHtmlPreview = ref<FetchHtmlResponse | null>(null)
  const fetchHtmlViewMode = ref<'jina' | 'raw' | 'compare'>('jina')
  const fetchHtmlUrl = ref('')
  const fetchHtmlMethod = ref('GET')
  const fetchHtmlBody = ref('')
  const fetchHtmlForceRefresh = ref(false)
  const fetchHtmlLoading = ref(false)
  const fetchHtmlError = ref('')

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

  const rawFetchHtmlPreviewSummary = computed(() => {
    const preview = rawFetchHtmlPreview.value
    if (!preview) {
      return []
    }
    return [
      `status: ${preview.status}`,
      `final: ${preview.finalUrl}`,
      `cache hit: ${preview.cacheHit ? 'yes' : 'no'}`,
      `cache source: ${preview.cacheSource}`,
      ...(preview.fetchDebug.respondWith
        ? [`respond with: ${preview.fetchDebug.respondWith}`]
        : []),
      `html chars: ${preview.html.length}`,
    ]
  })

  const fetchHtmlCompareSummary = computed(() => {
    const jina = fetchHtmlPreview.value
    const raw = rawFetchHtmlPreview.value
    if (!jina || !raw) {
      return []
    }
    const jinaLen = jina.html.length
    const rawLen = raw.html.length
    return [
      `jina chars: ${jinaLen}`,
      `raw chars: ${rawLen}`,
      `delta: ${jinaLen - rawLen}`,
      `same final url: ${jina.finalUrl === raw.finalUrl ? 'yes' : 'no'}`,
      `same content: ${jina.html === raw.html ? 'yes' : 'no'}`,
    ]
  })

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

  function applySnapshot(
    snapshot: SourceBuilderDebugSnapshot,
    lastFetchDebug: Ref<SourceFetchDebugInfo | null>
  ) {
    if (snapshot.sessionKey != null) {
      fetchSessionKey.value = snapshot.sessionKey
    }
    fetchHtmlPreview.value = snapshot.fetchHtmlPreview ?? null
    rawFetchHtmlPreview.value = null
    fetchHtmlError.value = ''
    fetchHtmlViewMode.value = snapshot.fetchDebug?.jinaUsed ? 'compare' : 'raw'
    lastFetchDebug.value = snapshot.fetchDebug ?? null
  }

  async function importFetchSession(lastFetchDebug: Ref<SourceFetchDebugInfo | null>) {
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
      options.pushDebugSnapshot({
        kind: 'session_import',
        title: 'Session imported',
        sourceLabel: options.currentPackage.value
          ? `${options.currentPackage.value.source.name} (${options.currentPackage.value.source.id})`
          : undefined,
        sessionKey: response.data.session.sessionKey,
        packageData: options.currentPackage.value,
        packageJson: options.currentPackageJson.value || undefined,
        diagnostics: options.previewDiagnostics.value,
        validationReport: options.getValidationReport(),
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

  async function previewFetchHtml(lastFetchDebug: Ref<SourceFetchDebugInfo | null>) {
    if (!fetchHtmlUrl.value.trim()) {
      warning('请先填写待抓取 URL')
      return
    }

    fetchHtmlLoading.value = true
    fetchHtmlError.value = ''
    rawFetchHtmlPreview.value = null
    try {
      const response = await syncApi.fetchHtmlWithSession({
        url: fetchHtmlUrl.value.trim(),
        method: fetchHtmlMethod.value.trim() || 'GET',
        ...(fetchHtmlBody.value.trim() ? { body: fetchHtmlBody.value } : {}),
        ...(fetchSessionKey.value.trim() ? { sessionKey: fetchSessionKey.value.trim() } : {}),
        forceRefresh: fetchHtmlForceRefresh.value,
        headers: parseHeadersText(sessionHeadersText.value),
        fetchMode: options.fetchMode.value,
        fetchProvider: options.fetchProvider.value,
        ...(options.fetchServiceUrl.value.trim()
          ? { fetchServiceUrl: options.fetchServiceUrl.value.trim() }
          : {}),
        ...(options.fetchEngine.value.trim()
          ? { fetchEngine: options.fetchEngine.value.trim() }
          : {}),
      })
      if (!response.isSuccess || !response.data) {
        fetchHtmlError.value = response.errorMsg || '预抓取 HTML 失败'
        warning(fetchHtmlError.value)
        return
      }
      fetchHtmlPreview.value = response.data
      lastFetchDebug.value = response.data.fetchDebug
      fetchHtmlViewMode.value = response.data.fetchDebug.jinaUsed ? 'compare' : 'raw'
      if (response.data.fetchDebug.jinaUsed) {
        const rawResponse = await syncApi.fetchHtmlWithSession({
          url: fetchHtmlUrl.value.trim(),
          method: fetchHtmlMethod.value.trim() || 'GET',
          ...(fetchHtmlBody.value.trim() ? { body: fetchHtmlBody.value } : {}),
          ...(fetchSessionKey.value.trim() ? { sessionKey: fetchSessionKey.value.trim() } : {}),
          forceRefresh: fetchHtmlForceRefresh.value,
          headers: parseHeadersText(sessionHeadersText.value),
          fetchMode: fetchSessionKey.value.trim() ? 'human_session' : 'replay',
          fetchProvider: fetchSessionKey.value.trim() ? 'session_replay' : 'curl_replay',
        })
        if (rawResponse.isSuccess && rawResponse.data) {
          rawFetchHtmlPreview.value = rawResponse.data
        }
      }
      options.pushDebugSnapshot({
        kind: 'fetch_html',
        title: 'Fetch HTML preview',
        sourceLabel: options.currentPackage.value
          ? `${options.currentPackage.value.source.name} (${options.currentPackage.value.source.id})`
          : undefined,
        sessionKey: fetchSessionKey.value.trim() || undefined,
        packageData: options.currentPackage.value,
        packageJson: options.currentPackageJson.value || undefined,
        diagnostics: options.previewDiagnostics.value,
        validationReport: options.getValidationReport(),
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

  function clearFetchState() {
    currentFetchSession.value = null
    fetchHtmlPreview.value = null
    rawFetchHtmlPreview.value = null
    fetchHtmlError.value = ''
  }

  return {
    fetchSessionKey,
    sessionCookiesText,
    sessionHeadersText,
    sessionLabel,
    sessionTtlSeconds,
    sessionLoading,
    currentFetchSession,
    fetchHtmlPreview,
    rawFetchHtmlPreview,
    fetchHtmlViewMode,
    fetchHtmlUrl,
    fetchHtmlMethod,
    fetchHtmlBody,
    fetchHtmlForceRefresh,
    fetchHtmlLoading,
    fetchHtmlError,
    fetchSessionSummary,
    fetchHtmlPreviewSummary,
    rawFetchHtmlPreviewSummary,
    fetchHtmlCompareSummary,
    applySnapshot,
    importFetchSession,
    loadFetchSession,
    previewFetchHtml,
    clearFetchState,
  }
}
