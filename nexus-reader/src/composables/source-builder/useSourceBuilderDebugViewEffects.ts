import { computed, watch, type ComputedRef, type Ref } from 'vue'
import type {
  NxsSourcePackageDetail,
  SourceBuildDiagnostics,
  SourceFetchDebugInfo,
} from '@/api/sync'
import type { SourceBuildPreviewSummary } from '@/stores/settings-store/types'
import type { SourceBuilderDebugSnapshot } from '@/composables/source-builder/types'

type UseSourceBuilderDebugViewEffectsOptions = {
  restoredDebugSnapshot: Ref<SourceBuilderDebugSnapshot | null>
  applyValidationSnapshot: (snapshot: SourceBuilderDebugSnapshot) => void
  applyFetchSnapshot: (
    snapshot: SourceBuilderDebugSnapshot,
    lastFetchDebug: Ref<SourceFetchDebugInfo | null>
  ) => void
  lastFetchDebug: Ref<SourceFetchDebugInfo | null>
  currentPackage: ComputedRef<NxsSourcePackageDetail | null>
  sourceBuildPreview: Ref<
    | {
        package: NxsSourcePackageDetail
        packageJson?: string | null
        diagnostics: SourceBuildDiagnostics
      }
    | null
    | undefined
  >
  previewPackage: Ref<NxsSourcePackageDetail | null>
  previewPackageJson: Ref<string>
  previewDiagnostics: Ref<SourceBuildDiagnostics | null>
  validateBookUrl: Ref<string>
  validateChapterUrl: Ref<string>
  runTargetUrl: Ref<string>
  fetchHtmlUrl: Ref<string>
  runSearchQuery: Ref<string>
  searchKeyword: Ref<string>
  sourceBuildPreviewSummary: ComputedRef<SourceBuildPreviewSummary>
}

export function useSourceBuilderDebugViewEffects(
  options: UseSourceBuilderDebugViewEffectsOptions
) {
  watch(options.restoredDebugSnapshot, snapshot => {
    if (!snapshot) {
      return
    }
    options.applyValidationSnapshot(snapshot)
    options.applyFetchSnapshot(snapshot, options.lastFetchDebug)
  })

  watch(
    options.currentPackage,
    value => {
      const samples = value?.samples
      if (!samples) {
        return
      }
      options.validateBookUrl.value = samples.bookSampleUrl || options.validateBookUrl.value
      options.validateChapterUrl.value = samples.chapterSampleUrl || options.validateChapterUrl.value
      options.runTargetUrl.value =
        samples.chapterSampleUrl || samples.bookSampleUrl || options.runTargetUrl.value
      options.fetchHtmlUrl.value = samples.bookSampleUrl || options.fetchHtmlUrl.value
      options.runSearchQuery.value = options.searchKeyword.value || options.runSearchQuery.value
    },
    { immediate: true }
  )

  watch(
    options.sourceBuildPreview,
    value => {
      options.previewPackage.value = value?.package ?? null
      options.previewPackageJson.value = value?.packageJson ?? ''
      options.previewDiagnostics.value = value?.diagnostics ?? null
    },
    { immediate: true }
  )

  const previewDiagnosticsItems = computed(
    () => options.sourceBuildPreviewSummary.value.diagnosticsItems
  )

  return {
    previewDiagnosticsItems,
  }
}
