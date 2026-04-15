import type { SourceHealthSummary } from '@/types/source'

export type GovernanceSuggestion = {
  id: string
  title: string
  detail: string
}

export function buildSourceGovernanceSuggestions(
  health?: SourceHealthSummary | null,
  circuitState?: string | null
): GovernanceSuggestion[] {
  if (!health) {
    return []
  }

  const suggestions: GovernanceSuggestion[] = []
  const primaryFailure = health.primaryFailure || 'none'
  const fallbackHitRate = health.fallbackHitRate ?? 0
  const avgQualityScore = health.avgQualityScore ?? 0
  const consecutiveFailures = health.consecutiveFailures ?? 0
  const circuit = circuitState || health.circuitState || 'closed'

  if (health.lowConfidence) {
    suggestions.push({
      id: 'low-confidence',
      title: '先补运行样本，再做最终治理判断',
      detail:
        '当前快照后的新增事件过少，治理画像置信度偏低。建议先继续跑 search / book / content 验证，再决定是否调整规则或重置状态。',
    })
  }

  if (circuit === 'open') {
    suggestions.push({
      id: 'circuit-open',
      title: '优先降低攻击性抓取参数',
      detail:
        '当前源已熔断，先降低并发、延长间隔、缩减重试，再验证 fetch 链路是否恢复，再考虑调整正文规则。',
    })
  }

  if (primaryFailure === 'timeout' || primaryFailure === 'network') {
    suggestions.push({
      id: 'network',
      title: '先排查抓取链路与超时预算',
      detail:
        '主故障集中在网络层。优先检查源站可达性、请求头/cookie/session 是否过期，以及 runtime profile 的 timeout 与 retry 配置是否过低。',
    })
  }

  if (primaryFailure === 'rule_mismatch') {
    suggestions.push({
      id: 'rule-mismatch',
      title: '重新校准选择器与字段映射',
      detail:
        '规则提取已偏离站点结构。优先回到 builder debug，用最新样本页重跑详情、目录、正文选择器，避免只依赖 fallback。',
    })
  }

  if (primaryFailure === 'empty_content') {
    suggestions.push({
      id: 'empty-content',
      title: '重点检查正文容器与分页拼接',
      detail:
        '内容拿到了但正文为空，通常是正文选择器失效、章节跳转落到占位页，或多页正文没有合并完整。',
    })
  }

  if (primaryFailure === 'low_quality' || avgQualityScore < 0.55) {
    suggestions.push({
      id: 'low-quality',
      title: '强化清洗规则与噪音过滤',
      detail:
        '当前正文质量偏低。优先补充广告词、站点尾注、分页提示等 replace/filter 规则，再对比规则提取与 fallback 提取的差异。',
    })
  }

  if (fallbackHitRate >= 0.4) {
    suggestions.push({
      id: 'fallback-heavy',
      title: '减少对 fallback 提取的依赖',
      detail:
        'fallback 命中率偏高，说明规则稳定性不足。建议补强正文主选择器、章节标题选择器和关键字段校验，降低运行时漂移。',
    })
  }

  if (consecutiveFailures >= 3) {
    suggestions.push({
      id: 'streak',
      title: '先做小样本验证，再恢复大规模使用',
      detail:
        '连续失败已经形成趋势。先在调试页用单书详情、目录、单章正文做冒烟验证，确认恢复后再放回主搜索/阅读链路。',
    })
  }

  return suggestions.filter(
    (item, index, array) => array.findIndex(candidate => candidate.id === item.id) === index
  )
}
