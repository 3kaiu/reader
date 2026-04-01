import { ref } from 'vue'
import { useAddonsStore } from '@/stores/addons'
import { useLibraryStore } from '@/stores/library'
import { useReplaceStore } from '@/stores/replace'
import { useSourceStore } from '@/stores/source'
import { useSettingsStore } from '@/stores/settings'
import { AUTH_TOKEN_STORAGE_KEY } from '@/utils/authStorage'
import {
  clearCachesByPatterns,
  deleteIndexedDatabases,
  estimateBrowserStorage,
  removeLocalStorageKeys,
  removeLocalStorageKeysByPrefix,
  type BrowserStorageEstimate,
} from '@/utils/browserStorage'
import { downloadJsonFile } from '@/utils/download'

const APP_LOCAL_STORAGE_KEYS = [
  'app-config',
  'reader-progress',
  'reader-settings',
  AUTH_TOKEN_STORAGE_KEY,
  'nexus_default_model',
  'nexus_available_models',
] as const

const LEGACY_LOCAL_STORAGE_KEYS = [
  'ai-analysis-config',
  'ai-analysis-mappings',
  'offline_operations',
  'offline_content',
] as const

const APP_INDEXED_DB_NAMES = ['nexus-reader', 'nexus-ai-models'] as const

export function useSettingsMaintenance() {
  const addonsStore = useAddonsStore()
  const libraryStore = useLibraryStore()
  const replaceStore = useReplaceStore()
  const sourceStore = useSourceStore()
  const settingsStore = useSettingsStore()
  const storageUsage = ref<BrowserStorageEstimate | null>(null)

  async function refreshStorageUsage(): Promise<void> {
    storageUsage.value = await estimateBrowserStorage()
  }

  async function exportDataBackup(): Promise<void> {
    const [groups, replaces, sources] = await Promise.all([
      libraryStore.loadGroups(true),
      replaceStore.loadRules(true),
      sourceStore.loadSources(true),
    ])

    downloadJsonFile(
      `reader_backup_${new Date().toISOString().slice(0, 10)}.json`,
      {
        groups: groups.data,
        replaces: replaces.data,
        sources: sources.data,
        timestamp: Date.now(),
        version: '3.0',
      }
    )
  }

  async function clearAppCache(): Promise<void> {
    removeLocalStorageKeys([
      ...APP_LOCAL_STORAGE_KEYS,
      ...LEGACY_LOCAL_STORAGE_KEYS,
    ])
    removeLocalStorageKeysByPrefix('offline_')
    await clearCachesByPatterns(['webllm', 'mlc', 'ai-models', 'nexus'])
    await deleteIndexedDatabases(APP_INDEXED_DB_NAMES)
  }

  async function hydrateSettingsDashboard(): Promise<void> {
    addonsStore.refresh()
    await Promise.allSettled([
      refreshStorageUsage(),
      settingsStore.refreshClientRouting(),
      settingsStore.refreshAgentRouting(),
      settingsStore.refreshAgentConfig(),
      settingsStore.refreshAgentConfigAudit(20),
      settingsStore.refreshSourcePackages(),
    ])
  }

  async function clearAppData(): Promise<void> {
    await clearAppCache()
    addonsStore.refresh()
    settingsStore.clearClientRouting()
    settingsStore.clearAgentRouting()
    settingsStore.clearAgentConfig()
    settingsStore.clearAgentConfigAudit()
    settingsStore.clearSourcePackages()
    settingsStore.clearSourcePackageDetail()
    await refreshStorageUsage()
  }

  return {
    storageUsage,
    refreshStorageUsage,
    exportDataBackup,
    clearAppCache,
    hydrateSettingsDashboard,
    clearAppData,
  }
}
