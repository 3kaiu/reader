<script setup lang="ts">
/**
 * 解密卡片组件
 * 显示加密词的真实指代、置信度、推理依据
 */
import { ref, computed } from 'vue'
import {
  X,
  Check,
  Edit3,
  ChevronDown,
  ChevronUp,
  User,
  Building2,
  MapPin,
  Calendar,
  Users,
} from 'lucide-vue-next'
import type { DecodedEntity, Candidate, EntityCategory } from '@/types/decoder'

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

const showAllCandidates = ref(false)
const isEditing = ref(false)
const editValue = ref('')

/** 获取类别图标 */
function getCategoryIcon(category: EntityCategory) {
  switch (category) {
    case 'person':
      return User
    case 'company':
      return Building2
    case 'place':
      return MapPin
    case 'event':
      return Calendar
    case 'organization':
      return Users
    default:
      return User
  }
}

/** 获取类别名称 */
function getCategoryName(category: EntityCategory): string {
  const names: Record<EntityCategory, string> = {
    person: '人物',
    company: '公司',
    place: '地点',
    event: '事件',
    organization: '组织',
  }
  return names[category] || '未知'
}

/** 获取来源名称 */
function getSourceName(source: string): string {
  const names: Record<string, string> = {
    dictionary: '词典',
    rule: '规则',
    knowledge_graph: '知识图谱',
    ai: 'AI推理',
  }
  return names[source] || source
}

/** 获取置信度颜色 */
function getConfidenceColor(confidence: number): string {
  if (confidence >= 80) return 'text-green-500'
  if (confidence >= 50) return 'text-yellow-500'
  return 'text-red-500'
}

/** 获取置信度背景色 */
function getConfidenceBg(confidence: number): string {
  if (confidence >= 80) return 'bg-green-500/10'
  if (confidence >= 50) return 'bg-yellow-500/10'
  return 'bg-red-500/10'
}

/** 显示的候选列表 */
const displayCandidates = computed(() => {
  if (showAllCandidates.value) {
    return props.entity.candidates
  }
  return props.entity.candidates.slice(0, 1)
})

/** 是否有更多候选 */
const hasMoreCandidates = computed(() => props.entity.candidates.length > 1)

/** 开始编辑 */
function startEdit() {
  editValue.value = props.entity.bestMatch?.real || ''
  isEditing.value = true
}

/** 提交编辑 */
function submitEdit() {
  if (editValue.value.trim()) {
    emit('correct', props.entity, editValue.value.trim())
  }
  isEditing.value = false
}

/** 取消编辑 */
function cancelEdit() {
  isEditing.value = false
  editValue.value = ''
}

/** 确认当前结果 */
function confirmResult() {
  emit('confirm', props.entity)
}

/** 卡片样式 */
const cardStyle = computed(() => {
  if (!props.position) return {}
  return {
    position: 'fixed' as const,
    left: `${props.position.x}px`,
    top: `${props.position.y}px`,
    transform: 'translateX(-50%)',
    zIndex: 1000,
  }
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
                :is="getCategoryIcon(candidate.category)"
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
            {{ getCategoryName(candidate.category) }}
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
        @click="showAllCandidates = !showAllCandidates"
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
