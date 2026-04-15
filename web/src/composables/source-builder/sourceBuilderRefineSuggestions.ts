import type {
  NxsSourcePackageDetail,
  SourceBuildDiagnostics,
  SourceRuleHints,
  SourceValidationStepReport,
} from '@/api/sync'
import type { RefineSuggestion } from '@/composables/source-builder/types'

type RefineSuggestionContext = {
  currentPackage: NxsSourcePackageDetail | null
  validationSteps: SourceValidationStepReport[]
  previewDiagnostics: SourceBuildDiagnostics | null
  structuredHints: SourceRuleHints
  freeTextHints: string
}

type RefineSuggestionMutators = {
  setFetchMode: (value: string) => void
  setFetchProvider: (value: string) => void
  setStructuredHints: (value: SourceRuleHints) => void
  setFreeTextHints: (value: string) => void
}

export function hasStructuredSourceRuleHints(value: SourceRuleHints) {
  return Boolean(
    value.searchEntry ||
    value.searchResultSelector ||
    value.bookTitleSelector ||
    value.authorSelector ||
    value.introSelector ||
    value.tocItemSelector ||
    value.contentSelector ||
    value.contentTitleSelector ||
    value.paginationSelector ||
    value.noisePatterns.length > 0
  )
}

export function mergeNoisePatterns(hints: SourceRuleHints, patterns: string[]): SourceRuleHints {
  return {
    ...hints,
    noisePatterns: Array.from(
      new Set([
        ...(hints.noisePatterns ?? []),
        ...patterns.map(item => item.trim()).filter(Boolean),
      ])
    ),
  }
}

export function appendFreeTextHint(hints: string, line: string) {
  const trimmed = line.trim()
  if (!trimmed) {
    return hints
  }

  const lines = hints
    .split('\n')
    .map(item => item.trim())
    .filter(Boolean)

  if (!lines.includes(trimmed)) {
    lines.push(trimmed)
  }

  return lines.join('\n')
}

export function buildRefineSuggestions(
  context: RefineSuggestionContext,
  mutators: RefineSuggestionMutators
): RefineSuggestion[] {
  const pkg = context.currentPackage
  const steps = context.validationSteps
  if (!pkg || steps.length === 0) {
    return []
  }

  const suggestions: RefineSuggestion[] = []
  const preferredProbeInput = context.previewDiagnostics?.preferredProbeInput
  const aiReadabilityGain = context.previewDiagnostics?.aiReadabilityGain ?? 0
  const trafilaturaReadabilityGain = context.previewDiagnostics?.trafilaturaReadabilityGain ?? 0
  const recommendedContentExtractor = context.previewDiagnostics?.recommendedContentExtractor

  const updateStructuredHints = (updater: (current: SourceRuleHints) => SourceRuleHints) => {
    mutators.setStructuredHints(updater(context.structuredHints))
  }

  const updateFreeTextHints = (...lines: string[]) => {
    let nextValue = context.freeTextHints
    for (const line of lines) {
      nextValue = appendFreeTextHint(nextValue, line)
    }
    mutators.setFreeTextHints(nextValue)
  }

  for (const step of steps) {
    const code = step.failureCode ?? ''
    if (step.step === 'search' && code === 'empty_result') {
      suggestions.push({
        id: 'search-selector-fallback',
        step: step.step,
        title: '补充搜索结果选择器兜底',
        detail: '把常见搜索列表选择器预填到 structured hints，优先修正 search result selector。',
        kind: 'structured',
        applyLabel: '填充 search selector',
        apply: () => {
          updateStructuredHints(current => ({
            ...current,
            searchResultSelector: '.bookbox | .result-item | .search-item | li | a[href]',
          }))
        },
      })
      const hasJinaSearch = pkg.searchProfile?.strategies?.some(
        item => item.enabled && item.provider === 'jina_search'
      )
      if (hasJinaSearch) {
        suggestions.push({
          id: 'search-jina-fallback',
          step: step.step,
          title: '启用 Jina 外部发现补位',
          detail:
            '当前包未验证 native_search，可先通过 jina_search 命中详情页，再补 search_curl 回修原生搜索规则。',
          kind: 'free_text',
          applyLabel: '追加 Jina 搜索提示',
          apply: () => {
            updateFreeTextHints(
              'search result: 当前站内搜索规则未验证时，先用 jina_search 外部发现定位详情页',
              'search result: 命中详情页后，再补 search_curl 回修 native_search 的结果块和详情链接规则'
            )
          },
        })
      }
    }

    if (step.step === 'search' && (code === 'fetch_failed' || code === 'fetch_timeout')) {
      suggestions.push({
        id: 'search-fetch-session',
        step: step.step,
        title: '改用人工 Session 抓取',
        detail: '当前搜索抓取失败，优先检查并导入 session，再复用到 build/validate 流程。',
        kind: 'fetch',
        applyLabel: '切到 human session',
        apply: () => {
          mutators.setFetchMode('human_session')
          mutators.setFetchProvider('session_replay')
        },
      })
    }

    if (step.step === 'book_info' && code === 'selector_miss') {
      suggestions.push({
        id: 'book-title-author-fallback',
        step: step.step,
        title: '补充书名/作者选择器',
        detail: 'book_info 命中为空时，先把常见标题和作者选择器写入 structured hints。',
        kind: 'structured',
        applyLabel: '填充 book selectors',
        apply: () => {
          updateStructuredHints(current => ({
            ...current,
            bookTitleSelector: "h1 | .book-title | .title | meta[property='og:title']",
            authorSelector: '.author | .book-author | .info .author',
          }))
        },
      })
    }

    if (
      step.step === 'search_detail' &&
      [
        'detail_mismatch',
        'detail_cross_site',
        'detail_fetch_failed',
        'detail_selector_miss',
      ].includes(code)
    ) {
      suggestions.push({
        id: 'search-detail-url-fallback',
        step: step.step,
        title: '修正搜索详情链接提取',
        detail:
          '搜索结果能出来，但跳到详情页失败，优先修正 search item url selector 或增加结果过滤。',
        kind: 'structured',
        applyLabel: '填充 url selector',
        apply: () => {
          updateStructuredHints(current => ({
            ...current,
            searchResultSelector:
              '.search-list > li | .result-list li | .book-list li | .bookbox | .result-item',
          }))
          updateFreeTextHints(
            'search result selector: .search-list > li',
            'search result selector: .result-list li'
          )
        },
      })
      suggestions.push({
        id: 'search-detail-free-text',
        step: step.step,
        title: '补充搜索结果说明',
        detail: '显式告诉 refine 哪个元素才是书籍详情链接，而不是作者页、最新章节页或导航链接。',
        kind: 'free_text',
        applyLabel: '追加 free text',
        apply: () => {
          updateFreeTextHints(
            'search result: 选择每本书结果卡片，不要选择分页或导航',
            'book title: 搜索结果中的书名链接就是详情页入口'
          )
        },
      })
      if (code === 'detail_cross_site') {
        suggestions.push({
          id: 'search-detail-cross-site-filter',
          step: step.step,
          title: '收紧搜索结果过滤',
          detail: '当前搜索结果疑似跳到了跨站页、作者页或榜单页，应补充 result_filter 约束路径。',
          kind: 'free_text',
          applyLabel: '追加 filter 提示',
          apply: () => {
            updateFreeTextHints('search result: 只保留书籍详情页，不要作者页、章节页、排行页')
          },
        })
      }
      if (code === 'detail_selector_miss') {
        suggestions.push({
          id: 'search-detail-book-selectors',
          step: step.step,
          title: '修正详情页书籍选择器',
          detail: '详情页能打开但书名规则不命中，优先补 book title / author selector。',
          kind: 'structured',
          applyLabel: '填充详情 selectors',
          apply: () => {
            updateStructuredHints(current => ({
              ...current,
              bookTitleSelector: "h1 | .book-title | .title | .info h1 | meta[property='og:title']",
              authorSelector: '.author | .book-author | .info .author | p.author',
            }))
          },
        })
      }
    }

    if (step.step === 'chapters' && code === 'empty_result') {
      suggestions.push({
        id: 'toc-selector-fallback',
        step: step.step,
        title: '补充目录选择器',
        detail: '目录为空时，优先扩宽 toc item selector，而不是直接改内容规则。',
        kind: 'structured',
        applyLabel: '填充 toc selector',
        apply: () => {
          updateStructuredHints(current => ({
            ...current,
            tocItemSelector: '.chapter-list a | #list a | .catalog a | a[href]',
          }))
        },
      })
    }

    if (step.step === 'content' && (code === 'low_quality' || code === 'manual_review')) {
      suggestions.push({
        id: `content-selector-${code}`,
        step: step.step,
        title: '补充正文选择器兜底',
        detail: '正文质量低时，先收窄 content selector 到常见正文容器，再做噪音过滤。',
        kind: 'structured',
        applyLabel: '填充 content selector',
        apply: () => {
          updateStructuredHints(current => ({
            ...current,
            contentSelector: '#content | .content | .txtnav | .read-content | article',
          }))
        },
      })
      suggestions.push({
        id: `content-noise-${code}`,
        step: step.step,
        title: '补充正文噪音规则',
        detail: '对广告、最新网址、推广、手机阅读等常见污染词先加清洗规则。',
        kind: 'structured',
        applyLabel: '填充 noise patterns',
        apply: () => {
          updateStructuredHints(current =>
            mergeNoisePatterns(current, ['最新网址', '推广', '广告', '手机阅读', '收藏本站'])
          )
        },
      })
      suggestions.push({
        id: `content-free-text-${code}`,
        step: step.step,
        title: '补一条自由文本提示',
        detail: '当页面结构特殊时，给 refine 一条显式说明，避免只靠 fallback。',
        kind: 'free_text',
        applyLabel: '追加 free text',
        apply: () => {
          updateFreeTextHints('content selector: #content', 'noise pattern: 最新网址')
        },
      })
      if (preferredProbeInput === 'jina_readable' && aiReadabilityGain >= 0.08) {
        suggestions.push({
          id: `content-jina-${code}`,
          step: step.step,
          title: '按 Jina 可读结果收窄正文',
          detail: 'Jina 输出的正文纯度明显更高，优先围绕正文主块收窄 selector，并补充噪音模式。',
          kind: 'free_text',
          applyLabel: '追加 Jina 正文提示',
          apply: () => {
            updateFreeTextHints(
              'content selector: 以正文主块为准，不包含顶部导航、底部推荐、相关推荐、广告区',
              'content selector: 参考 Jina markdown/text 中连续正文段落的共同容器'
            )
            updateStructuredHints(current =>
              mergeNoisePatterns(current, ['最新网址', '请收藏', '手机阅读', '扫码', '广告'])
            )
          },
        })
      }
      if (recommendedContentExtractor === 'trafilatura' && trafilaturaReadabilityGain >= 0.08) {
        suggestions.push({
          id: `content-trafilatura-${code}`,
          step: step.step,
          title: '按 Trafilatura 结果收窄正文',
          detail:
            'Trafilatura 提取的连续正文更干净，优先围绕它暴露出的段落边界修正 content selector 和噪音清洗。',
          kind: 'free_text',
          applyLabel: '追加 Trafilatura 提示',
          apply: () => {
            updateFreeTextHints(
              'content selector: 以连续正文段落的共同父容器为准，不包含顶部导航、章节工具栏、相关推荐、广告区',
              'content cleanup: 对照 trafilatura 提取结果，补充 filter tag 与 replace noise pattern'
            )
            updateStructuredHints(current =>
              mergeNoisePatterns(current, [
                '最新网址',
                '请收藏',
                '手机阅读',
                '推广',
                '广告',
                '上一章',
                '下一章',
              ])
            )
          },
        })
      }
    }
  }

  const blockers = pkg.readiness?.blockers ?? []
  const suggestedActions = pkg.readiness?.suggestedActions ?? []
  if (blockers.includes('search_not_ready')) {
    suggestions.push({
      id: 'readiness-search-not-ready',
      step: 'readiness',
      title: '优先修复搜索入口',
      detail: '当前全链路被搜索环节阻塞，先补 searchResultSelector 或补充 search_curl 样本。',
      kind: 'structured',
      applyLabel: '填充搜索入口提示',
      apply: () => {
        updateStructuredHints(current => ({
          ...current,
          searchResultSelector:
            current.searchResultSelector ||
            '.search-list > li | .result-list li | .bookbox | .result-item | a[href]',
        }))
        updateFreeTextHints(
          'search result: 请定位搜索结果列表中每本书的条目容器',
          'search result url: 请确认条目中的详情链接字段'
        )
      },
    })
  }
  if (blockers.includes('book_detail_not_ready')) {
    suggestions.push({
      id: 'readiness-book-detail-not-ready',
      step: 'readiness',
      title: '修复详情页书名/作者规则',
      detail: '详情环节阻塞时，优先补 book title / author selector，保证详情页主信息可提取。',
      kind: 'structured',
      applyLabel: '填充详情页提示',
      apply: () => {
        updateStructuredHints(current => ({
          ...current,
          bookTitleSelector:
            current.bookTitleSelector ||
            "h1 | .book-title | .title | .info h1 | meta[property='og:title']",
          authorSelector: current.authorSelector || '.author | .book-author | .info .author',
        }))
      },
    })
  }
  if (blockers.includes('toc_not_ready')) {
    suggestions.push({
      id: 'readiness-toc-not-ready',
      step: 'readiness',
      title: '修复目录列表规则',
      detail: '目录环节阻塞时，先补 tocItemSelector，确保章节列表可提取。',
      kind: 'structured',
      applyLabel: '填充目录提示',
      apply: () => {
        updateStructuredHints(current => ({
          ...current,
          tocItemSelector:
            current.tocItemSelector || '.chapter-list a | #list a | .catalog a | a[href]',
        }))
      },
    })
  }
  if (blockers.includes('content_not_ready')) {
    suggestions.push({
      id: 'readiness-content-not-ready',
      step: 'readiness',
      title: '修复正文提取与噪音清洗',
      detail: '正文环节阻塞时，先收窄正文容器并追加常见噪音词清洗。',
      kind: 'structured',
      applyLabel: '填充正文提示',
      apply: () => {
        updateStructuredHints(current =>
          mergeNoisePatterns(
            {
              ...current,
              contentSelector:
                current.contentSelector ||
                '#content | .content | .txtnav | .read-content | article',
            },
            ['最新网址', '推广', '广告', '手机阅读', '请收藏']
          )
        )
      },
    })
  }
  if (suggestedActions.includes('run_validation_with_samples')) {
    suggestions.push({
      id: 'readiness-run-validation-with-samples',
      step: 'readiness',
      title: '补齐样本再跑校验',
      detail: '规则包尚不可导入，先补 search/book/toc/chapter 样本 URL 后重新 validate。',
      kind: 'free_text',
      applyLabel: '追加样本校验提示',
      apply: () => {
        updateFreeTextHints(
          'validation samples: 请提供可访问的 search/book/toc/chapter 样本链接',
          'validation: 样本与规则必须来自同源站点'
        )
      },
    })
  }

  return suggestions.filter(
    (item, index, list) => list.findIndex(candidate => candidate.id === item.id) === index
  )
}
