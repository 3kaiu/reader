import { computed, ref } from 'vue'
import { useDecoderDictionaryView } from '@/composables/useDecoderDictionaryView'
import { useManageSelection } from '@/composables/useManageSelection'
import type {
  DictionaryEntry,
  DictionaryLevel,
  EntityCategory,
} from '@/types/decoder'
import { filterDecoderEntries } from '@/utils/decoderDictionaryView'

export function useDecoderDictionaryPageView() {
  const searchKeyword = ref('')
  const filterCategory = ref<EntityCategory | 'all'>('all')
  const filterLevel = ref<DictionaryLevel | 'all'>('all')

  const {
    isManageMode,
    selectedKeys: selectedEntries,
    selectedCount,
    setSelection,
    clearSelection,
    toggleSelect,
    selectAll,
    toggleManageMode,
  } = useManageSelection<DictionaryEntry, string>(
    entry => entry.id,
    () => filteredEntries.value
  )

  const dictionaryView = useDecoderDictionaryView({
    selectedEntryIds: selectedEntries,
    clearSelection,
    setSelection,
    toggleManageMode,
  })

  const filteredEntries = computed(() =>
    filterDecoderEntries(dictionaryView.entries.value, {
      searchKeyword: searchKeyword.value,
      filterCategory: filterCategory.value,
      filterLevel: filterLevel.value,
    })
  )

  const stats = computed(() => ({
    total: dictionaryView.entries.value.length,
    filtered: filteredEntries.value.length,
    selected: selectedCount.value,
    byCategory: dictionaryView.categoryStats.value,
  }))

  return {
    searchKeyword,
    filterCategory,
    filterLevel,
    filteredEntries,
    isManageMode,
    selectedEntries,
    selectedCount,
    toggleSelect,
    selectAll,
    toggleManageMode,
    stats,
    ...dictionaryView,
  }
}
