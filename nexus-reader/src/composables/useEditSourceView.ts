import { ref, watch } from 'vue'
import { useMessage } from '@/composables/useMessage'
import { useSourceStore } from '@/stores/source'
import type { BookSource } from '@/types/source'

type EditSourceViewProps = {
  open?: boolean
  source?: BookSource | null
}

export function useEditSourceView(options: { props: EditSourceViewProps }) {
  const message = useMessage()
  const sourceStore = useSourceStore()

  const loading = ref(false)
  const jsonText = ref('')

  watch(
    () => options.props.open,
    async open => {
      if (!open || !options.props.source) {
        return
      }

      loading.value = true
      try {
        const result = await sourceStore.getSourceDetailText(options.props.source)
        jsonText.value = result.text

        if (result.isStale && result.errorMsg) {
          message.warning(result.errorMsg)
        }
      } catch {
        message.warning('无法加载最新书源定义，已显示当前列表中的数据')
      } finally {
        loading.value = false
      }
    }
  )

  return {
    loading,
    jsonText,
  }
}
