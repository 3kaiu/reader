import { ref, watch } from 'vue'
import { useMessage } from '@/composables/useMessage'
import { useReplaceStore } from '@/stores/replace'
import type { ReplaceRule } from '@/types/replace'

type EditRuleViewProps = {
  open?: boolean
  rule?: ReplaceRule | null
}

export function useEditRuleView(options: {
  props: EditRuleViewProps
  close: () => void
  notifySaved: () => void
}) {
  const message = useMessage()
  const replaceStore = useReplaceStore()

  const loading = ref(false)
  const form = ref(replaceStore.createRuleDraft())

  watch(
    () => options.props.open,
    open => {
      if (open) {
        form.value = replaceStore.createRuleDraft(options.props.rule)
      }
    }
  )

  async function handleSave() {
    loading.value = true
    try {
      const result = await replaceStore.saveRuleDraft(form.value)
      if (result.status === 'saved') {
        message.success(options.props.rule ? '修改成功' : '新增成功')
        options.notifySaved()
        options.close()
        form.value = replaceStore.createRuleDraft()
        return
      }

      if (result.status === 'invalid') {
        message.warning(result.errorMsg || '表单内容不完整')
        return
      }

      message.error(result.errorMsg || '保存失败')
    } catch {
      message.error('保存出错')
    } finally {
      loading.value = false
    }
  }

  return {
    loading,
    form,
    handleSave,
  }
}
