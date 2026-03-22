import { computed, ref, shallowRef } from 'vue'

type SelectionKey = string | number

export function useManageSelection<T, K extends SelectionKey>(
  getKey: (item: T) => K | null | undefined,
  items?: () => readonly T[],
) {
  const isManageMode = ref(false)
  const selectedKeys = shallowRef<Set<K>>(new Set())
  const selectedCount = computed(() => selectedKeys.value.size)

  function setSelection(keys: Iterable<K>) {
    selectedKeys.value = new Set(keys)
  }

  function clearSelection() {
    selectedKeys.value = new Set()
  }

  function isSelected(item: T): boolean {
    const key = getKey(item)
    return key != null && selectedKeys.value.has(key)
  }

  function toggleSelect(item: T) {
    const key = getKey(item)
    if (key == null) {
      return
    }

    const nextSelection = new Set(selectedKeys.value)

    if (nextSelection.has(key)) {
      nextSelection.delete(key)
    } else {
      nextSelection.add(key)
    }

    selectedKeys.value = nextSelection
  }

  function selectAll(targetItems: readonly T[] = items ? items() : []) {
    const currentItems = Array.from(targetItems)
    const currentKeys = currentItems
      .map(item => getKey(item))
      .filter((key): key is K => key != null)
    const isAllCurrentSelected =
      currentKeys.length > 0 && currentKeys.every(key => selectedKeys.value.has(key))

    if (isAllCurrentSelected) {
      clearSelection()
      return
    }

    setSelection(currentKeys)
  }

  function toggleManageMode(force?: boolean) {
    const nextState = force ?? !isManageMode.value
    isManageMode.value = nextState

    if (!nextState) {
      clearSelection()
    }
  }

  return {
    isManageMode,
    selectedKeys,
    selectedCount,
    setSelection,
    clearSelection,
    isSelected,
    toggleSelect,
    selectAll,
    toggleManageMode,
  }
}
