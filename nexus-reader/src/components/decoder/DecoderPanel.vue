<script setup lang="ts">
/**
 * 解密面板组件
 * 整合高亮和卡片功能，提供完整的解密交互体验
 */
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { Sparkles, Loader2, AlertCircle, RefreshCw } from 'lucide-vue-next'
import DecoderHighlight from './DecoderHighlight.vue'
import DecoderCard from './DecoderCard.vue'
import { useDecoder } from '@/composables/useDecoder'
import type { DecodedEntity, BookMeta, BookType } from '@/types/decoder'

interface Props {
  /** 书籍 ID */
  bookId: string
  /** 章节 ID */
  chapterId: string
  /** 章节内容 */
  content: string
  /** 书籍元数据 */
  bookMeta?: BookMeta
  /** 是否启用解密 */
  enabled?: boolean
  /** 是否自动解码 */
  autoDeccode?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  enabled: true,
  autoDeccode: true,
})

const emit = defineEmits<{
  decoded: [entities: DecodedEntity[]]
  error: [message: string]
}>()

const decoder = useDecoder()

// 状态
const selectedEntity = ref<DecodedEntity | null>(null)
const cardPosition = ref({ x: 0, y: 0 })
const showCard = ref(false)
const hasDecoded = ref(false)

// 计算属性
const entities = computed(() => decoder.lastDecodeResult.value?.entities || [])
const isLoading = computed(() => decoder.isLoading.value)
const error = computed(() => decoder.error.value)

/** 执行解码 */
async function decode() {
  if (!props.enabled || !props.content) return

  const result = await decoder.decodeChapter(
    props.bookId,
    props.chapterId,
    props.content,
    props.bookMeta
  )

  if (result) {
    hasDecoded.value = true
    emit('decoded', result.entities)
  } else if (decoder.error.value) {
    emit('error', decoder.error.value)
  }
}

/** 处理实体点击 */
function handleEntityClick(entity: DecodedEntity, event: MouseEvent) {
  selectedEntity.value = entity

  // 计算卡片位置
  const rect = (event.target as HTMLElement).getBoundingClientRect()
  cardPosition.value = {
    x: rect.left + rect.width / 2,
    y: rect.bottom + 8,
  }

  // 确保卡片不超出屏幕
  const cardWidth = 288 // w-72 = 18rem = 288px
  const screenWidth = window.innerWidth
  const screenHeight = window.innerHeight

  if (cardPosition.value.x - cardWidth / 2 < 16) {
    cardPosition.value.x = cardWidth / 2 + 16
  } else if (cardPosition.value.x + cardWidth / 2 > screenWidth - 16) {
    cardPosition.value.x = screenWidth - cardWidth / 2 - 16
  }

  // 如果底部空间不足，显示在上方
  if (cardPosition.value.y + 300 > screenHeight) {
    cardPosition.value.y = rect.top - 8
  }

  showCard.value = true
}

/** 关闭卡片 */
function closeCard() {
  showCard.value = false
  selectedEntity.value = null
}

/** 确认实体 */
async function handleConfirm(entity: DecodedEntity) {
  const success = await decoder.confirmEntity(
    entity,
    props.bookId,
    props.bookMeta?.type
  )

  if (success) {
    closeCard()
  }
}

/** 纠正实体 */
async function handleCorrect(entity: DecodedEntity, newReal: string) {
  const success = await decoder.correctEntity(
    entity,
    newReal,
    props.bookId,
    props.bookMeta?.type
  )

  if (success) {
    closeCard()
    // 重新解码以获取更新后的结果
    await decode()
  }
}

/** 点击外部关闭卡片 */
function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (!target.closest('.decoder-card') && !target.closest('.decoder-entity')) {
    closeCard()
  }
}

// 监听内容变化自动解码
watch(
  () => [props.chapterId, props.content],
  () => {
    if (props.autoDeccode && props.enabled) {
      hasDecoded.value = false
      decode()
    }
  },
  { immediate: true }
)

// 监听点击事件
onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div class="decoder-panel">
    <!-- 解码状态指示器 -->
    <div
      v-if="enabled"
      class="decoder-status fixed bottom-20 right-4 z-40"
    >
      <!-- 加载中 -->
      <div
        v-if="isLoading"
        class="flex items-center gap-2 px-3 py-2 bg-background/80 backdrop-blur border border-border rounded-full shadow-lg"
      >
        <Loader2 class="w-4 h-4 animate-spin text-primary" />
        <span class="text-xs">解密中...</span>
      </div>

      <!-- 错误 -->
      <div
        v-else-if="error"
        class="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-full shadow-lg cursor-pointer"
        @click="decode"
      >
        <AlertCircle class="w-4 h-4 text-red-500" />
        <span class="text-xs text-red-500">解密失败</span>
        <RefreshCw class="w-3 h-3 text-red-500" />
      </div>

      <!-- 已解码 -->
      <div
        v-else-if="hasDecoded && entities.length > 0"
        class="flex items-center gap-2 px-3 py-2 bg-green-500/10 border border-green-500/20 rounded-full shadow-lg"
      >
        <Sparkles class="w-4 h-4 text-green-500" />
        <span class="text-xs text-green-600">
          发现 {{ entities.length }} 个加密词
        </span>
      </div>

      <!-- 无结果 -->
      <div
        v-else-if="hasDecoded"
        class="flex items-center gap-2 px-3 py-2 bg-muted/80 backdrop-blur border border-border rounded-full shadow-lg"
      >
        <Sparkles class="w-4 h-4 opacity-40" />
        <span class="text-xs opacity-60">未发现加密词</span>
      </div>
    </div>

    <!-- 内容插槽（带高亮） -->
    <slot
      :entities="entities"
      :highlight-component="DecoderHighlight"
      :on-entity-click="handleEntityClick"
    >
      <!-- 默认渲染 -->
      <DecoderHighlight
        :text="content"
        :entities="entities"
        :enabled="enabled && hasDecoded"
        @entity-click="handleEntityClick"
      />
    </slot>

    <!-- 解密卡片 -->
    <Teleport to="body">
      <DecoderCard
        v-if="selectedEntity"
        :entity="selectedEntity"
        :position="cardPosition"
        :visible="showCard"
        @close="closeCard"
        @confirm="handleConfirm"
        @correct="handleCorrect"
      />
    </Teleport>
  </div>
</template>

<style scoped>
.decoder-panel {
  position: relative;
}

.decoder-status {
  transition: all 0.3s ease;
}
</style>
