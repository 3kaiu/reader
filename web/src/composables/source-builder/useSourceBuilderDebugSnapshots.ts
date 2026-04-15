import { computed, ref } from 'vue'
import { useMessage } from '@/composables/useMessage'
import { getLocalStorageItem, setLocalStorageItem } from '@/utils/browserStorage'
import type { SourceBuilderDebugSnapshot } from '@/composables/source-builder/types'

type UseSourceBuilderDebugSnapshotsOptions = {
  key?: string
  limit?: number
  onRestore: (snapshot: SourceBuilderDebugSnapshot) => void
}

const DEFAULT_SNAPSHOT_KEY = 'source-builder-debug-snapshots'
const DEFAULT_SNAPSHOT_LIMIT = 20

export function useSourceBuilderDebugSnapshots(options: UseSourceBuilderDebugSnapshotsOptions) {
  const { success, warning } = useMessage()
  const snapshotKey = options.key ?? DEFAULT_SNAPSHOT_KEY
  const snapshotLimit = options.limit ?? DEFAULT_SNAPSHOT_LIMIT

  const debugSnapshots = ref<SourceBuilderDebugSnapshot[]>([])

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

  function persistDebugSnapshots() {
    try {
      setLocalStorageItem(snapshotKey, JSON.stringify(debugSnapshots.value))
    } catch {
      // ignore persistence failures
    }
  }

  function loadDebugSnapshots() {
    try {
      const raw = getLocalStorageItem(snapshotKey)
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
    ].slice(0, snapshotLimit)
    persistDebugSnapshots()
  }

  function restoreDebugSnapshot(snapshotId: string) {
    const snapshot = debugSnapshots.value.find(item => item.id === snapshotId)
    if (!snapshot) {
      warning('快照不存在')
      return
    }

    options.onRestore(snapshot)
    success(`已恢复快照: ${snapshot.title}`)
  }

  function clearDebugSnapshots() {
    debugSnapshots.value = []
    persistDebugSnapshots()
  }

  return {
    debugSnapshots,
    debugSnapshotSummary,
    loadDebugSnapshots,
    pushDebugSnapshot,
    restoreDebugSnapshot,
    clearDebugSnapshots,
  }
}
