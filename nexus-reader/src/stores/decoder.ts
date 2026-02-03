/**
 * 解码器状态管理
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { errorHandler, logger } from '@/utils/unified-utils'

interface DecoderRule {
  id: string
  name: string
  pattern: string
  replacement: string
  enabled: boolean
  priority: number
  category: string
}

interface DecoderStats {
  totalRules: number
  enabledRules: number
  appliedCount: number
  lastApplied: number
}

interface DecoderState {
  rules: DecoderRule[]
  isProcessing: boolean
  stats: DecoderStats
  customDictionaries: string[]
}

export const useDecoderStore = defineStore('decoder', () => {
  const state = ref<DecoderState>({
    rules: [],
    isProcessing: false,
    stats: {
      totalRules: 0,
      enabledRules: 0,
      appliedCount: 0,
      lastApplied: 0
    },
    customDictionaries: []
  })

  const enabledRules = computed(() =>
    state.value.rules.filter(rule => rule.enabled)
  )

  const rulesByCategory = computed(() => {
    const categories: Record<string, DecoderRule[]> = {}
    state.value.rules.forEach(rule => {
      if (!categories[rule.category]) {
        categories[rule.category] = []
      }
      categories[rule.category].push(rule)
    })
    return categories
  })

  const isProcessing = computed(() => state.value.isProcessing)

  const initializeRules = async () => {
    try {
      // 默认解码规则
      const defaultRules: DecoderRule[] = [
        {
          id: 'html_entities',
          name: 'HTML实体解码',
          pattern: '&[a-zA-Z0-9#]+;',
          replacement: '', // 由解码器处理
          enabled: true,
          priority: 1,
          category: 'html'
        },
        {
          id: 'unicode_escape',
          name: 'Unicode转义解码',
          pattern: '\\\\u[0-9a-fA-F]{4}',
          replacement: '',
          enabled: true,
          priority: 2,
          category: 'unicode'
        },
        {
          id: 'line_breaks',
          name: '换行符标准化',
          pattern: '\\r\\n|\\r',
          replacement: '\n',
          enabled: true,
          priority: 3,
          category: 'formatting'
        },
        {
          id: 'extra_spaces',
          name: '多余空格清理',
          pattern: ' {2,}',
          replacement: ' ',
          enabled: true,
          priority: 4,
          category: 'formatting'
        }
      ]

      state.value.rules = defaultRules
      updateStats()

      logger.info('Decoder rules initialized', { ruleCount: defaultRules.length })

    } catch (error) {
      errorHandler.handle(error, { component: 'decoder-store', operation: 'initializeRules' })
    }
  }

  const addRule = async (rule: Omit<DecoderRule, 'id'>) => {
    try {
      const newRule: DecoderRule = {
        ...rule,
        id: `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      }

      state.value.rules.push(newRule)
      updateStats()

      logger.info('Decoder rule added', { id: newRule.id, name: newRule.name })

    } catch (error) {
      errorHandler.handle(error, { component: 'decoder-store', operation: 'addRule' })
    }
  }

  const updateRule = async (id: string, updates: Partial<DecoderRule>) => {
    try {
      const index = state.value.rules.findIndex(rule => rule.id === id)
      if (index >= 0) {
        state.value.rules[index] = { ...state.value.rules[index], ...updates }
        updateStats()

        logger.info('Decoder rule updated', { id, updates })
      }

    } catch (error) {
      errorHandler.handle(error, { component: 'decoder-store', operation: 'updateRule' })
    }
  }

  const removeRule = async (id: string) => {
    try {
      const index = state.value.rules.findIndex(rule => rule.id === id)
      if (index >= 0) {
        const removedRule = state.value.rules.splice(index, 1)[0]
        updateStats()

        logger.info('Decoder rule removed', { id, name: removedRule.name })
      }

    } catch (error) {
      errorHandler.handle(error, { component: 'decoder-store', operation: 'removeRule' })
    }
  }

  const toggleRule = async (id: string) => {
    try {
      const rule = state.value.rules.find(r => r.id === id)
      if (rule) {
        rule.enabled = !rule.enabled
        updateStats()

        logger.info('Decoder rule toggled', { id, enabled: rule.enabled })
      }

    } catch (error) {
      errorHandler.handle(error, { component: 'decoder-store', operation: 'toggleRule' })
    }
  }

  const applyDecoding = async (text: string): Promise<string> => {
    if (!text) return text

    try {
      state.value.isProcessing = true

      let decodedText = text

      // 按优先级应用启用的规则
      const sortedRules = enabledRules.value.sort((a, b) => a.priority - b.priority)

      for (const rule of sortedRules) {
        try {
          const regex = new RegExp(rule.pattern, 'g')

          if (rule.id === 'html_entities') {
            // HTML实体特殊处理
            decodedText = decodedText.replace(regex, (match) => {
              const textarea = document.createElement('textarea')
              textarea.innerHTML = match
              return textarea.value
            })
          } else if (rule.id === 'unicode_escape') {
            // Unicode转义特殊处理
            decodedText = decodedText.replace(regex, (match) => {
              try {
                return String.fromCharCode(parseInt(match.slice(2), 16))
              } catch {
                return match
              }
            })
          } else {
            // 普通正则替换
            decodedText = decodedText.replace(regex, rule.replacement)
          }
        } catch (error) {
          logger.warn('Failed to apply decoder rule', { ruleId: rule.id, error })
        }
      }

      // 更新统计信息
      state.value.stats.appliedCount++
      state.value.stats.lastApplied = Date.now()

      logger.debug('Text decoding applied', {
        originalLength: text.length,
        decodedLength: decodedText.length
      })

      return decodedText

    } catch (error) {
      errorHandler.handle(error, { component: 'decoder-store', operation: 'applyDecoding' })
      return text
    } finally {
      state.value.isProcessing = false
    }
  }

  const importRules = async (rulesData: DecoderRule[]) => {
    try {
      // 验证规则格式
      const validRules = rulesData.filter(rule =>
        rule.name && rule.pattern && typeof rule.enabled === 'boolean'
      )

      state.value.rules.push(...validRules)
      updateStats()

      logger.info('Decoder rules imported', { count: validRules.length })

    } catch (error) {
      errorHandler.handle(error, { component: 'decoder-store', operation: 'importRules' })
    }
  }

  const exportRules = (): DecoderRule[] => {
    return [...state.value.rules]
  }

  const addCustomDictionary = async (dictionary: string) => {
    try {
      if (!state.value.customDictionaries.includes(dictionary)) {
        state.value.customDictionaries.push(dictionary)
        logger.info('Custom dictionary added', { dictionary })
      }

    } catch (error) {
      errorHandler.handle(error, { component: 'decoder-store', operation: 'addCustomDictionary' })
    }
  }

  const removeCustomDictionary = async (dictionary: string) => {
    try {
      const index = state.value.customDictionaries.indexOf(dictionary)
      if (index >= 0) {
        state.value.customDictionaries.splice(index, 1)
        logger.info('Custom dictionary removed', { dictionary })
      }

    } catch (error) {
      errorHandler.handle(error, { component: 'decoder-store', operation: 'removeCustomDictionary' })
    }
  }

  const updateStats = () => {
    state.value.stats.totalRules = state.value.rules.length
    state.value.stats.enabledRules = state.value.rules.filter(r => r.enabled).length
  }

  // 初始化
  initializeRules()

  return {
    // State
    state: readonly(state),

    // Getters
    enabledRules,
    rulesByCategory,
    isProcessing,

    // Actions
    addRule,
    updateRule,
    removeRule,
    toggleRule,
    applyDecoding,
    importRules,
    exportRules,
    addCustomDictionary,
    removeCustomDictionary
  }
})