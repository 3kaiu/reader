import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useManageSelection } from '@/composables/useManageSelection'
import { useReplaceRuleManagementView } from '@/composables/useReplaceRuleManagementView'
import { useReplaceStore } from '@/stores/replace'
import type { ReplaceRule } from '@/types/replace'
import { getReplaceRuleKey } from '@/utils/replaceRules'

export function useReplaceRulePageView() {
  const replaceStore = useReplaceStore()
  const { rules, loading, enabledCount } = storeToRefs(replaceStore)

  const searchKeyword = ref('')
  const filteredRules = computed(() =>
    replaceStore.filterRules(searchKeyword.value)
  )

  const {
    isManageMode,
    selectedKeys: selectedRuleKeys,
    selectedCount,
    setSelection,
    clearSelection,
    isSelected: isRuleSelected,
    toggleSelect,
    selectAll,
    toggleManageMode,
  } = useManageSelection<ReplaceRule, string>(
    getReplaceRuleKey,
    () => filteredRules.value
  )

  const stats = computed(() => ({
    total: rules.value.length,
    enabled: enabledCount.value,
    filtered: filteredRules.value.length,
    selected: selectedCount.value,
  }))

  const managementView = useReplaceRuleManagementView({
    selectedRuleKeys,
    filteredRules,
    clearSelection,
    setSelection,
    toggleManageMode,
  })

  return {
    rules,
    loading,
    enabledCount,
    searchKeyword,
    filteredRules,
    isManageMode,
    selectedRuleKeys,
    selectedCount,
    isRuleSelected,
    toggleSelect,
    selectAll,
    toggleManageMode,
    stats,
    ...managementView,
  }
}
