import { reactive, ref } from 'vue'
import { cloneDefaultConfig } from '@/utils/settingsStore'
import type { SettingsStoreState } from './types'

export function createSettingsStoreState(): SettingsStoreState {
  return {
    config: reactive(cloneDefaultConfig()),
    language: ref('zh-CN'),
    notifications: ref({
      enabled: true,
      sound: true,
      desktop: false,
    }),
    privacy: ref({
      analytics: true,
      crashReports: true,
      usageData: false,
    }),
    clientRouting: ref(null),
    clientRoutingLoading: ref(false),
    agentRouting: ref(null),
    agentRoutingLoading: ref(false),
    agentConfig: ref(null),
    agentConfigLoading: ref(false),
    agentConfigSaving: ref(false),
    agentConfigAudit: ref([]),
    agentConfigAuditLoading: ref(false),
    agentConfigAuditNextCursor: ref(null),
    agentConfigAuditHasMore: ref(false),
    sourcePackages: ref([]),
    sourcePackagesLoading: ref(false),
    sourcePackageImporting: ref(false),
    sourcePackageDetail: ref(null),
    sourcePackageDetailLoading: ref(false),
    sourceBuildRunning: ref(false),
    sourceBuildPreview: ref(null),
  }
}
