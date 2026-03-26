<script setup lang="ts">
import AiAnalysisMappingDialogActions from '@/components/ai-analysis/AiAnalysisMappingDialogActions.vue'
import AiAnalysisMappingDialogForm from '@/components/ai-analysis/AiAnalysisMappingDialogForm.vue'
import AiAnalysisMappingDialogHeader from '@/components/ai-analysis/AiAnalysisMappingDialogHeader.vue'
import type { AiMappingRule } from '@/types/ai-analysis'
import type { AiMappingDraft } from '@/utils/aiAnalysisTransfer'

interface Props {
  open: boolean
  editingRule: AiMappingRule | null
  draft: AiMappingDraft
}

defineProps<Props>()

const emit = defineEmits<{
  close: []
  save: []
}>()
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
    @click.self="emit('close')"
  >
    <div
      class="w-full max-w-md rounded-t-2xl sm:rounded-2xl border-t sm:border border-border bg-card shadow-xl p-6 space-y-4 animate-in slide-in-from-bottom sm:slide-in-from-top max-h-[90vh] overflow-y-auto"
      @click.stop
    >
      <AiAnalysisMappingDialogHeader
        :editing-rule="editingRule"
        @close="emit('close')"
      />

      <AiAnalysisMappingDialogForm :draft="draft" />

      <AiAnalysisMappingDialogActions
        @save="emit('save')"
        @close="emit('close')"
      />
    </div>
  </div>
</template>
