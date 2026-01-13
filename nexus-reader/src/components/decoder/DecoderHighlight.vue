<script setup lang="ts">
/**
 * 解密高亮文本组件
 * 将加密词用下划线标记，点击显示解密卡片
 */
import { computed } from 'vue'
import type { DecodedEntity } from '@/types/decoder'

interface Props {
  /** 原始文本 */
  text: string
  /** 解码后的实体列表 */
  entities: DecodedEntity[]
  /** 是否启用高亮 */
  enabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  enabled: true,
})

const emit = defineEmits<{
  entityClick: [entity: DecodedEntity, event: MouseEvent]
}>()

/** 按位置分割文本 */
const segments = computed(() => {
  if (!props.enabled || props.entities.length === 0) {
    return [{ type: 'text' as const, content: props.text }]
  }

  // 过滤有效实体并按位置排序
  const validEntities = props.entities
    .filter((e) => e.bestMatch !== null)
    .sort((a, b) => a.position.start - b.position.start)

  const result: Array<{
    type: 'text' | 'entity'
    content: string
    entity?: DecodedEntity
  }> = []

  let lastEnd = 0

  for (const entity of validEntities) {
    // 添加实体前的普通文本
    if (entity.position.start > lastEnd) {
      result.push({
        type: 'text',
        content: props.text.slice(lastEnd, entity.position.start),
      })
    }

    // 添加实体
    result.push({
      type: 'entity',
      content: props.text.slice(entity.position.start, entity.position.end),
      entity,
    })

    lastEnd = entity.position.end
  }

  // 添加最后的普通文本
  if (lastEnd < props.text.length) {
    result.push({
      type: 'text',
      content: props.text.slice(lastEnd),
    })
  }

  return result
})

/** 获取置信度对应的颜色类 */
function getConfidenceClass(confidence: number): string {
  if (confidence >= 80) return 'decoder-high'
  if (confidence >= 50) return 'decoder-medium'
  return 'decoder-low'
}

/** 处理实体点击 */
function handleEntityClick(entity: DecodedEntity, event: MouseEvent) {
  event.stopPropagation()
  emit('entityClick', entity, event)
}
</script>

<template>
  <span class="decoder-highlight">
    <template v-for="(segment, index) in segments" :key="index">
      <!-- 普通文本 -->
      <span v-if="segment.type === 'text'">{{ segment.content }}</span>

      <!-- 加密词（可点击） -->
      <span
        v-else
        class="decoder-entity"
        :class="getConfidenceClass(segment.entity!.bestMatch!.confidence)"
        :title="`${segment.entity!.bestMatch!.real} (${segment.entity!.bestMatch!.confidence}%)`"
        @click="handleEntityClick(segment.entity!, $event)"
      >
        {{ segment.content }}
      </span>
    </template>
  </span>
</template>

<style scoped>
.decoder-entity {
  cursor: pointer;
  border-bottom: 2px dotted currentColor;
  padding-bottom: 1px;
  transition: all 0.2s ease;
}

.decoder-entity:hover {
  background-color: rgba(var(--primary-rgb, 59, 130, 246), 0.1);
  border-bottom-style: solid;
}

/* 高置信度 - 绿色 */
.decoder-high {
  border-color: rgb(34, 197, 94);
  color: inherit;
}

.decoder-high:hover {
  background-color: rgba(34, 197, 94, 0.1);
}

/* 中置信度 - 黄色 */
.decoder-medium {
  border-color: rgb(234, 179, 8);
  color: inherit;
}

.decoder-medium:hover {
  background-color: rgba(234, 179, 8, 0.1);
}

/* 低置信度 - 红色 */
.decoder-low {
  border-color: rgb(239, 68, 68);
  color: inherit;
}

.decoder-low:hover {
  background-color: rgba(239, 68, 68, 0.1);
}
</style>
