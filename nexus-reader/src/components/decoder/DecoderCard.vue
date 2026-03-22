<script setup lang="ts">
/**
 * 解密卡片组件 (增强版)
 * 显示加密词的真实指代、置信度、推理依据
 * 支持确认、纠正、实体关联功能
 */
import { useDecoderCardView } from '@/composables/useDecoderCardView'
import {
  X,
  Check,
  Edit3,
  ChevronDown,
  ChevronUp,
} from 'lucide-vue-next'
import type { DecodedEntity } from '@/types/decoder'
import { DECODER_CATEGORY_CONFIG } from '@/constants/decoderDictionary'

interface Props {
  /** 解码后的实体 */
  entity: DecodedEntity
  /** 卡片位置 */
  position?: { x: number; y: number }
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
      <!-- 头部 -->
      <div class="flex items-start justify-between mb-3">
        <div class="flex items-center gap-2">
          <span class="text-lg font-bold text-primary">{{ entity.original }}</span>
          <span class="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
            {{ getSourceName(entity.source) }}
          </span>
        </div>
        <button
          class="p-1 hover:bg-muted rounded transition-colors"
          @click="emit('close')"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- 候选列表 -->
      <div class="space-y-2">
        <div
          v-for="(candidate, index) in displayCandidates"
          :key="index"
          class="p-3 rounded-lg"
          :class="[
            index === 0 ? getConfidenceBg(candidate.confidence) : 'bg-muted/50',
          ]"
        >
          <!-- 真实指代 -->
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <component
                :is="DECODER_CATEGORY_CONFIG[candidate.category].icon"
                class="w-4 h-4 opacity-60"
              />
              <span class="font-medium">{{ candidate.real }}</span>
            </div>
            <span
              class="text-sm font-mono"
              :class="getConfidenceColor(candidate.confidence)"
            >
              {{ candidate.confidence }}%
            </span>
          </div>

          <!-- 类别 -->
          <div class="text-xs text-muted-foreground mb-1">
            {{ DECODER_CATEGORY_CONFIG[candidate.category].label }}
          </div>

          <!-- 推理依据 -->
          <div v-if="candidate.reasoning" class="text-xs text-muted-foreground">
            {{ candidate.reasoning }}
          </div>

          <!-- 证据列表 -->
          <div v-if="candidate.evidence?.length" class="mt-2">
            <div class="text-xs text-muted-foreground mb-1">证据:</div>
            <ul class="text-xs text-muted-foreground list-disc list-inside">
              <li v-for="(ev, i) in candidate.evidence" :key="i">{{ ev }}</li>
            </ul>
          </div>
        </div>
      </div>

      <!-- 展开更多候选 -->
      <button
        v-if="hasMoreCandidates"
        class="w-full mt-2 py-1 text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1 transition-colors"
        @click="toggleCandidates"
      >
        <template v-if="showAllCandidates">
          <ChevronUp class="w-3 h-3" />
          收起
        </template>
        <template v-else>
          <ChevronDown class="w-3 h-3" />
          查看其他 {{ entity.candidates.length - 1 }} 个候选
        </template>
      </button>

      <!-- 编辑模式 -->
      <div v-if="isEditing" class="mt-3 pt-3 border-t border-border">
        <div class="text-xs text-muted-foreground mb-2">输入正确的指代:</div>
        <div class="flex gap-2">
          <input
            v-model="editValue"
            type="text"
            class="flex-1 px-2 py-1 text-sm border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="输入正确答案"
            @keyup.enter="submitEdit"
            @keyup.escape="cancelEdit"
          />
          <button
            class="px-2 py-1 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90 transition-colors"
            @click="submitEdit"
          >
            确定
          </button>
        </div>
        <button
          class="mt-2 text-xs text-muted-foreground hover:text-foreground"
          @click="cancelEdit"
        >
          取消
        </button>
      </div>

      <!-- 操作按钮 -->
      <div v-else class="mt-3 pt-3 border-t border-border flex gap-2">
        <button
          class="flex-1 py-1.5 text-sm bg-green-500/10 text-green-600 hover:bg-green-500/20 rounded flex items-center justify-center gap-1 transition-colors"
          @click="confirmResult"
        >
          <Check class="w-4 h-4" />
          确认
        </button>
        <button
          class="flex-1 py-1.5 text-sm bg-muted hover:bg-muted/80 rounded flex items-center justify-center gap-1 transition-colors"
          @click="startEdit"
        >
          <Edit3 class="w-4 h-4" />
          纠错
        </button>
      </div>
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
