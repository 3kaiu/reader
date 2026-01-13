/**
 * Decoder Store - 网文解密状态管理
 * 管理书籍级解密设置、解码状态、实体选择等
 */
import { defineStore } from 'pinia'
import { useStorage } from '@vueuse/core'
import { ref, computed, shallowRef } from 'vue'
import type {
  DecodedEntity,
  ChapterContext,
  BookType,
  BookState,
} from '@/types/decoder'

/** 书籍解密设置 */
export interface BookDecoderSettings {
  /** 是否启用解密 */
  enabled: boolean
  /** 书籍类型 (用于上下文感知解码) */
  bookType: BookType | null
  /** 统计信息 */
  stats: {
    decodedChapters: number
    totalEntities: number
    lastDecoded: number
  }
}

/** 卡片位置 */
export interface CardPosition {
  x: number
  y: number
}

/** 默认书籍设置 */
const defaultBookSettings: BookDecoderSettings = {
  enabled: false,
  bookType: null,
  stats: {
    decodedChapters: 0,
    totalEntities: 0,
    lastDecoded: 0,
  },
}

export const useDecoderStore = defineStore('decoder', () => {
  // ====== 持久化状态 ======
  // 书籍解密设置 (按 bookUrl 索引)
  const bookSettings = useStorage<Record<string, BookDecoderSettings>>(
    'decoder:book-settings',
    {}
  )

  // ====== 运行时状态 ======
  // 当前解码状态
  const isDecoding = ref(false)
  const decodeError = ref<string | null>(null)

  // 当前章节解码结果
  const currentEntities = shallowRef<DecodedEntity[]>([])
  const currentContext = shallowRef<ChapterContext | null>(null)
  const currentBookState = shallowRef<BookState | null>(null)

  // 选中的实体 (用于显示卡片)
  const selectedEntity = ref<DecodedEntity | null>(null)
  const cardPosition = ref<CardPosition>({ x: 0, y: 0 })
  const showCard = ref(false)

  // 当前书籍 URL
  const currentBookUrl = ref<string | null>(null)

  // ====== 计算属性 ======
  /** 当前书籍的解密设置 */
  const currentSettings = computed(() => {
    if (!currentBookUrl.value) return defaultBookSettings
    return getBookSettings(currentBookUrl.value)
  })

  /** 当前书籍是否启用解密 */
  const isEnabled = computed(() => currentSettings.value.enabled)

  /** 有效实体数量 (有 bestMatch 的) */
  const validEntitiesCount = computed(() =>
    currentEntities.value.filter((e) => e.bestMatch !== null).length
  )

  /** 已知别名列表 (从 BookState.aliasChains 获取) */
  const knownAliases = computed(() => {
    if (!currentBookState.value) return []
    return currentBookState.value.aliasChains.map((chain) => ({
      alias: chain.bookAlias,
      realName: chain.realName,
      entityId: chain.entityId,
    }))
  })

  // ====== 方法 ======
  /**
   * 获取书籍的解密设置
   */
  function getBookSettings(bookUrl: string): BookDecoderSettings {
    return bookSettings.value[bookUrl] || { ...defaultBookSettings }
  }

  /**
   * 更新书籍的解密设置
   */
  function updateBookSettings(
    bookUrl: string,
    settings: Partial<BookDecoderSettings>
  ) {
    const current = getBookSettings(bookUrl)
    bookSettings.value = {
      ...bookSettings.value,
      [bookUrl]: {
        ...current,
        ...settings,
        stats: {
          ...current.stats,
          ...(settings.stats || {}),
        },
      },
    }
  }

  /**
   * 切换书籍解密开关
   */
  function toggleEnabled(bookUrl: string) {
    const current = getBookSettings(bookUrl)
    updateBookSettings(bookUrl, { enabled: !current.enabled })
  }

  /**
   * 设置当前书籍
   */
  function setCurrentBook(bookUrl: string) {
    currentBookUrl.value = bookUrl
    // 重置运行时状态
    currentEntities.value = []
    currentContext.value = null
    decodeError.value = null
    closeCard()
  }

  /**
   * 设置解码状态
   */
  function setDecoding(loading: boolean) {
    isDecoding.value = loading
    if (loading) {
      decodeError.value = null
    }
  }

  /**
   * 设置解码错误
   */
  function setDecodeError(error: string | null) {
    decodeError.value = error
    isDecoding.value = false
  }

  /**
   * 设置解码结果
   */
  function setDecodeResult(
    entities: DecodedEntity[],
    context: ChapterContext | null
  ) {
    currentEntities.value = entities
    currentContext.value = context
    isDecoding.value = false
    decodeError.value = null

    // 更新统计
    if (currentBookUrl.value) {
      const current = getBookSettings(currentBookUrl.value)
      updateBookSettings(currentBookUrl.value, {
        stats: {
          decodedChapters: current.stats.decodedChapters + 1,
          totalEntities: current.stats.totalEntities + entities.filter((e) => e.bestMatch).length,
          lastDecoded: Date.now(),
        },
      })
    }
  }

  /**
   * 设置书籍状态 (从后端获取)
   */
  function setBookState(state: BookState | null) {
    currentBookState.value = state
  }

  /**
   * 选择实体 (显示卡片)
   */
  function selectEntity(entity: DecodedEntity, position: CardPosition) {
    selectedEntity.value = entity
    cardPosition.value = position
    showCard.value = true
  }

  /**
   * 关闭卡片
   */
  function closeCard() {
    showCard.value = false
    selectedEntity.value = null
  }

  /**
   * 更新实体 (用于确认/纠正后更新本地状态)
   */
  function updateEntity(entityId: string, updates: Partial<DecodedEntity>) {
    const index = currentEntities.value.findIndex((e) => e.id === entityId)
    if (index !== -1) {
      const updated = [...currentEntities.value]
      updated[index] = { ...updated[index], ...updates }
      currentEntities.value = updated
    }
  }

  /**
   * 添加别名链
   */
  function addAliasChain(alias: string, realName?: string, entityId?: string) {
    if (!currentBookState.value) return

    const newChain = { bookAlias: alias, realName, entityId }
    currentBookState.value = {
      ...currentBookState.value,
      aliasChains: [...currentBookState.value.aliasChains, newChain],
    }
  }

  /**
   * 重置 store
   */
  function reset() {
    currentBookUrl.value = null
    currentEntities.value = []
    currentContext.value = null
    currentBookState.value = null
    isDecoding.value = false
    decodeError.value = null
    closeCard()
  }

  /**
   * 清除所有书籍设置
   */
  function clearAllSettings() {
    bookSettings.value = {}
  }

  return {
    // 状态
    bookSettings,
    isDecoding,
    decodeError,
    currentEntities,
    currentContext,
    currentBookState,
    selectedEntity,
    cardPosition,
    showCard,
    currentBookUrl,

    // 计算属性
    currentSettings,
    isEnabled,
    validEntitiesCount,
    knownAliases,

    // 方法
    getBookSettings,
    updateBookSettings,
    toggleEnabled,
    setCurrentBook,
    setDecoding,
    setDecodeError,
    setDecodeResult,
    setBookState,
    selectEntity,
    closeCard,
    updateEntity,
    addAliasChain,
    reset,
    clearAllSettings,
  }
})
