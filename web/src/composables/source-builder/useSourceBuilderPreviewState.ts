import { computed, ref, type Ref } from 'vue'
import type { SourceBuilderDebugSnapshot } from '@/composables/source-builder/types'
import type {
  NxsSourcePackageDetail,
  SourceBuildDiagnostics,
  SourceFetchDebugInfo,
} from '@/api/sync'

type PreviewSummaryLike = {
  packageJson?: string
}

type UseSourceBuilderPreviewStateOptions = {
  sourcePackageDetail: Ref<NxsSourcePackageDetail | null>
  sourceBuildPreviewSummary: Ref<PreviewSummaryLike>
  bookCurl: Ref<string>
  chapterCurl: Ref<string>
  searchCurl: Ref<string>
  searchKeyword: Ref<string>
}

export function useSourceBuilderPreviewState({
  sourcePackageDetail,
  sourceBuildPreviewSummary,
  bookCurl,
  chapterCurl,
  searchCurl,
  searchKeyword,
}: UseSourceBuilderPreviewStateOptions) {
  const lastFetchDebug = ref<SourceFetchDebugInfo | null>(null)
  const previewPackage = ref<NxsSourcePackageDetail | null>(null)
  const previewPackageJson = ref('')
  const previewDiagnostics = ref<SourceBuildDiagnostics | null>(null)
  const restoredDebugSnapshot = ref<SourceBuilderDebugSnapshot | null>(null)

  const currentPackage = computed(() => previewPackage.value || sourcePackageDetail.value || null)
  const currentPackageJson = computed(
    () => previewPackageJson.value || sourceBuildPreviewSummary.value.packageJson || ''
  )

  function applyDebugSnapshot(snapshot: SourceBuilderDebugSnapshot) {
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
    previewPackage.value = snapshot.packageData ?? null
    previewPackageJson.value = snapshot.packageJson ?? ''
    previewDiagnostics.value = snapshot.diagnostics ?? null
    restoredDebugSnapshot.value = snapshot
  }

  return {
    lastFetchDebug,
    previewPackage,
    previewPackageJson,
    previewDiagnostics,
    restoredDebugSnapshot,
    currentPackage,
    currentPackageJson,
    applyDebugSnapshot,
  }
}
