import { ref, watch } from 'vue'
import type { BookGroup } from '@/types/group'

export function useMoveBookDialogView(options: {
  open: boolean
  groups: BookGroup[]
  onConfirm: (groupId: string | null) => void
  onClose: () => void
}) {
  const selectedId = ref<string | null>(null)

  function selectGroup(groupId: string | null) {
    selectedId.value = groupId
  }

  function handleConfirm() {
    options.onConfirm(selectedId.value)
    options.onClose()
  }

  watch(
    () => options.open,
    open => {
      if (open) {
        selectedId.value = null
      }
    }
  )

  return {
    selectedId,
    selectGroup,
    handleConfirm,
  }
}
