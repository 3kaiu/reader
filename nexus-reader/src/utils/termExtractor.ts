/**
 * 术语提取工具
 * 从文本中智能提取疑似术语、黑话、梗
 */

// 常见停用词 (不作为候选术语)
const STOPWORDS = new Set([
  '的', '了', '是', '在', '我', '你', '他', '她', '它', '们',
  '这', '那', '有', '和', '与', '或', '但', '因', '为', '所',
  '以', '而', '且', '于', '着', '过', '就', '也', '还', '很',
  '把', '被', '让', '给', '从', '到', '去', '来', '上', '下',
  '中', '里', '外', '前', '后', '左', '右', '大', '小', '多',
  '少', '好', '坏', '高', '低', '长', '短', '说', '道', '看',
  '想', '要', '能', '会', '可', '得', '没', '不', '已', '将'
])

export interface ExtractConfig {
  maxTerms: number       // 最多提取数量
  minFreq: number        // 最小出现频率
  includeQuoted: boolean // 包含引号内容
  includeFrequent: boolean // 包含高频词
}

const DEFAULT_CONFIG: ExtractConfig = {
  maxTerms: 15,
  minFreq: 2,
  includeQuoted: true,
  includeFrequent: true
}

/**
 * 从文本中提取候选术语
 */
export function extractCandidateTerms(
  content: string,
  config: Partial<ExtractConfig> = {}
): string[] {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const candidates = new Map<string, number>()

  // 1. 提取书名号/引号内容 (高置信度 +10)
  if (cfg.includeQuoted) {
    const quotePatterns = [
      /《([^》]{2,10})》/g,    // 书名号
      /「([^」]{2,8})」/g,     // 直角引号
      /"([^"]{2,8})"/g,       // 中文引号
      /'([^']{2,8})'/g,       // 中文单引号
    ]

    for (const pattern of quotePatterns) {
      for (const match of content.matchAll(pattern)) {
        const term = match[1].trim()
        if (term && !STOPWORDS.has(term)) {
          candidates.set(term, (candidates.get(term) || 0) + 10)
        }
      }
    }
  }

  // 2. 提取高频词 (中置信度 +1 per occurrence)
  if (cfg.includeFrequent) {
    // 提取2-4字词组
    const wordPattern = /[\u4e00-\u9fa5]{2,4}/g
    const words = content.match(wordPattern) || []

    for (const word of words) {
      if (!STOPWORDS.has(word) && !isCommonWord(word)) {
        candidates.set(word, (candidates.get(word) || 0) + 1)
      }
    }
  }

  // 3. 按权重排序并返回
  return Array.from(candidates.entries())
    .filter(([_, score]) => score >= cfg.minFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, cfg.maxTerms)
    .map(([term]) => term)
}

/**
 * 判断是否为常见词 (非术语)
 */
function isCommonWord(word: string): boolean {
  // 常见动词、形容词等
  const common = new Set([
    '知道', '觉得', '认为', '发现', '看到', '听到', '感觉', '明白',
    '开始', '继续', '停止', '结束', '完成', '进行', '发展', '变化',
    '非常', '十分', '特别', '相当', '确实', '实在', '简直', '真的',
    '突然', '渐渐', '慢慢', '终于', '立刻', '马上', '随后', '然后',
    '什么', '怎么', '为什么', '哪里', '哪个', '谁', '几个', '多少',
    '一个', '两个', '三个', '这个', '那个', '每个', '所有', '全部',
    '时候', '地方', '事情', '东西', '问题', '情况', '原因', '结果',
    '自己', '对方', '双方', '别人', '大家', '众人', '人们'
  ])
  return common.has(word)
}

/**
 * 快速提取 - 只提取引号内容
 */
export function extractQuotedTerms(content: string, maxCount = 10): string[] {
  const terms = new Set<string>()
  const patterns = [
    /《([^》]{2,10})》/g,
    /「([^」]{2,8})」/g,
    /"([^"]{2,8})"/g,
  ]

  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      if (terms.size >= maxCount) break
      const term = match[1].trim()
      if (term && term.length >= 2) {
        terms.add(term)
      }
    }
  }

  return Array.from(terms)
}
