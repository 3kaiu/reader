/**
 * 列表管理组合式函数
 * 提供搜索、过滤、批量管理等通用功能
 */
import { ref, computed, type Ref } from 'vue'

export interface ListItem {
  [key: string]: unknown
}

export interface UseListManagementOptions<T extends ListItem> {
  items: Ref<T[]>
  searchFields?: string[] // 搜索字段
  filterFn?: (item: T, keyword: string) => boolean // 自定义过滤函数
  getItemId: (item: T) => string // 获取项目ID的函数
}

export function useListManagement<T extends ListItem>(options: UseListManagementOptions<T>) {
  const {
    items,
    searchFields = [],
    filterFn,
    getItemId,
  } = options

  // 搜索关键词
  const searchKeyword = ref('')
  
  // 管理模式
  const isManageMode = ref(false)
  
  // 选中的项目ID集合
  const selectedIds = ref<Set<string>>(new Set())

  // 过滤后的列表
  const filteredItems = computed(() => {
    let result = items.value

    // 搜索过滤
    if (searchKeyword.value) {
      const keyword = searchKeyword.value.toLowerCase()
      if (filterFn) {
        result = result.filter(item => filterFn(item, keyword))
      } else if (searchFields.length > 0) {
        result = result.filter(item => {
          return searchFields.some(field => {
            const value = getNestedValue(item, field)
            return String(value || '').toLowerCase().includes(keyword)
          })
        })
      }
    }

    return result
  })

  // 获取嵌套值
  function getNestedValue(obj: unknown, path: string): unknown {
    return path.split('.').reduce((acc: unknown, key: string) => {
      return acc && typeof acc === 'object' && key in acc
        ? (acc as Record<string, unknown>)[key]
        : ''
    }, obj)
  }

  // 切换管理模式
  function toggleManageMode() {
    isManageMode.value = !isManageMode.value
    if (!isManageMode.value) {
      selectedIds.value.clear()
    }
  }

  // 切换选择
  function toggleSelect(item: T) {
    const id = getItemId(item)
    if (selectedIds.value.has(id)) {
      selectedIds.value.delete(id)
    } else {
      selectedIds.value.add(id)
    }
  }

  // 全选/取消全选
  function selectAll() {
    if (selectedIds.value.size === filteredItems.value.length) {
      selectedIds.value.clear()
    } else {
      selectedIds.value = new Set(filteredItems.value.map(getItemId))
    }
  }

  // 清空选择
  function clearSelection() {
    selectedIds.value.clear()
  }

  // 检查是否选中
  function isSelected(item: T): boolean {
    return selectedIds.value.has(getItemId(item))
  }

  return {
    searchKeyword,
    isManageMode,
    selectedIds,
    filteredItems,
    toggleManageMode,
    toggleSelect,
    selectAll,
    clearSelection,
    isSelected,
  }
}
