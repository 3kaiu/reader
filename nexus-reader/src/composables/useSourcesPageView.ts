import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useManageSelection } from '@/composables/useManageSelection'
import { useSourceManagementView } from '@/composables/useSourceManagementView'
import { useSourceStore, type SourceListItem } from '@/stores/source'
import { filterSourcesByGroup } from '@/utils/sourceStore'

export function useSourcesPageView() {
  const sourceStore = useSourceStore()
  const { sources, loading, enabledCount, groups } = storeToRefs(sourceStore)

  const searchKeyword = ref('')
  const activeGroup = ref('全部')
  const activeTab = ref('local')

  const filteredSources = computed(() => {
    const searchedSources = sourceStore.filterSources(searchKeyword.value)
    return filterSourcesByGroup(searchedSources, activeGroup.value)
  })

  const {
    isManageMode,
    selectedKeys: selectedSourceIds,
    selectedCount,
    setSelection,
    clearSelection,
    isSelected: isSourceSelected,
    toggleSelect,
    selectAll,
    toggleManageMode,
  } = useManageSelection<SourceListItem, string>(
    source => source.id,
    () => filteredSources.value
  )

  const stats = computed(() => ({
    total: sources.value.length,
    enabled: enabledCount.value,
    filtered: filteredSources.value.length,
    selected: selectedCount.value,
  }))

  const managementView = useSourceManagementView({
    selectedSourceIds,
    filteredSources,
    clearSelection,
    setSelection,
    toggleManageMode,
  })

  return {
    sources,
    loading,
    enabledCount,
    groups,
    searchKeyword,
    activeGroup,
    activeTab,
    filteredSources,
    isManageMode,
    selectedSourceIds,
    selectedCount,
    isSourceSelected,
    toggleSelect,
    selectAll,
    toggleManageMode,
    stats,
    ...managementView,
  }
}
