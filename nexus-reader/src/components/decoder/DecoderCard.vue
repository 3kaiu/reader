<script setup lang="ts">
/**
 * 解密卡片组件 (增强版)
 * 显示加密词的真实指代、置信度、推理依据
 * 支持确认、纠正、实体关联功能
 */
import { useDecoderCardView } from '@/composables/useDecoderCardView'
import type { DecodedEntity } from '@/types/decoder'
import DecoderCardActions from './DecoderCardActions.vue'
import DecoderCardCandidates from './DecoderCardCandidates.vue'
import DecoderCardEditor from './DecoderCardEditor.vue'
import DecoderCardHeader from './DecoderCardHeader.vue'

interface Props {
  /** 解码后的实体 */
  entity: DecodedEntity
  /** 卡片位置 */
  position?: { x: number; y: number } | null
  /** 是否显示 */
  visible?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  visible: true,
})

const emit = defineEmits<{
  close: []
  confirm: [entity: DecodedEntity]
  correct: [entity: DecodedEntity, newReal: string]
}>()

const {
  showAllCandidates,
  isEditing,
  editValue,
  displayCandidates,
  hasMoreCandidates,
  cardStyle,
  getSourceName,
  getConfidenceColor,
  getConfidenceBg,
  toggleCandidates,
  startEdit,
  submitEdit,
  cancelEdit,
  confirmResult,
} = useDecoderCardView({
  entity: props.entity,
  position: props.position,
  onConfirm: entity => emit('confirm', entity),
  onCorrect: (entity, newReal) => emit('correct', entity, newReal),
})
</script>

<template>
  <Transition name="fade">
    <div
      v-if="visible"
      class="decoder-card bg-background border border-border rounded-lg shadow-lg p-4 w-72"
      :style="cardStyle"
    >
      <DecoderCardHeader
        :entity="entity"
        :source-name="getSourceName(entity.source)"
        @close="emit('close')"
      />

      <DecoderCardCandidates
        :entity="entity"
        :display-candidates="displayCandidates"
        :show-all-candidates="showAllCandidates"
        :has-more-candidates="hasMoreCandidates"
        :get-confidence-color="getConfidenceColor"
        :get-confidence-bg="getConfidenceBg"
        @toggle="toggleCandidates"
      />

      <DecoderCardEditor
        v-if="isEditing"
        v-model="editValue"
        @submit="submitEdit"
        @cancel="cancelEdit"
      />

      <DecoderCardActions
        v-else
        @confirm="confirmResult"
        @edit="startEdit"
      />
    </div>
  </Transition>
</template>

<style scoped>
.decoder-card {
  max-height: 80vh;
  overflow-y: auto;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-10px);
}
</style>
