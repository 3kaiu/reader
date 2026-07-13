<script setup lang="ts">
import ReaderNavigation from './ReaderNavigation.vue'
import ReaderProgress from './ReaderProgress.vue'
import ReaderToolbarBottomActions from './ReaderToolbarBottomActions.vue'
import { createReaderToolbarBottomPanelBindings } from './toolbar-bottom-panel-bindings'
import type { ReaderToolbarBottomPanelProps } from './toolbar-bottom-panel-prop-types'
import { useReaderStore } from '@/stores/reader'
import { computed } from 'vue'

const props = defineProps<ReaderToolbarBottomPanelProps>()

const { navigationBindings, progressProps, actionBindings } =
  createReaderToolbarBottomPanelBindings(props)

const readerStore = useReaderStore()

const stageReportsSummary = computed(() => {
  const reports = readerStore.contentStageReports
  const total = reports.length
  const failed = reports.filter(r => r.ok === false).length
  return { total, failed }
})

const copyRequestId = () => {
  const value = readerStore.diagnosticsRequestId
  if (!value) return
  void globalThis.navigator?.clipboard?.writeText(value)
}
</script>

<template>
  <div
    class="reader-toolbar-glass mx-3 mb-3 rounded-2xl shadow-premium overflow-hidden border border-white/10"
  >
    <div class="px-5 pt-5 pb-4">
      <ReaderNavigation v-bind="navigationBindings" />

      <div class="mt-4">
        <ReaderProgress v-bind="progressProps" />
      </div>

      <details class="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
        <summary class="cursor-pointer select-none text-sm text-white/80">
          诊断信息
          <span class="ml-2 text-xs text-white/50">
            {{ stageReportsSummary.failed }}/{{ stageReportsSummary.total }}
          </span>
        </summary>
        <div class="mt-3 space-y-2 text-xs text-white/70">
          <div v-if="readerStore.diagnosticsRequestId" class="flex gap-2">
            <span class="shrink-0 text-white/50">X-Request-ID</span>
            <button
              type="button"
              class="truncate text-left underline decoration-dotted underline-offset-2 hover:text-white"
              :title="readerStore.diagnosticsRequestId"
              @click="copyRequestId"
            >
              {{ readerStore.diagnosticsRequestId }}
            </button>
          </div>
          <div v-if="readerStore.diagnosticsPackageId" class="flex gap-2">
            <span class="shrink-0 text-white/50">packageId</span>
            <span class="truncate" :title="readerStore.diagnosticsPackageId">
              {{ readerStore.diagnosticsPackageId }}
            </span>
          </div>
          <pre
            v-if="readerStore.contentStageReports.length > 0"
            class="max-h-44 overflow-auto rounded-lg bg-black/30 p-2 text-[11px] leading-snug"
            >{{ JSON.stringify(readerStore.contentStageReports, null, 2) }}
          </pre>
        </div>
      </details>
    </div>
    <ReaderToolbarBottomActions v-bind="actionBindings" />
  </div>
</template>
