/**
 * AI 分析结果导出工具
 * 支持导出 Markdown 格式的分析报告
 */
import { getCache } from '@/composables/useAICache'

interface ExportOptions {
    bookName: string
    bookUrl: string
    chapters: Array<{ index: number; title: string }>
}

/**
 * 导出 AI 分析报告
 * @param options 导出选项
 * @returns Markdown 格式的报告内容
 */
export async function exportAIAnalysis(options: ExportOptions): Promise<string> {
    const { bookName, bookUrl, chapters } = options

    let markdown = `# 《${bookName}》AI 分析报告\n\n`
    markdown += `**生成时间**：${new Date().toLocaleString('zh-CN')}\n\n`
    markdown += `**章节数**：${chapters.length} 章\n\n`
    markdown += `---\n\n`

    let hasContent = false

    for (const chapter of chapters) {
        const summary = await getCache(bookUrl, chapter.index, 'summary')
        const homophone = await getCache(bookUrl, chapter.index, 'homophone')

        if (summary || homophone) {
            hasContent = true
            markdown += `## 第 ${chapter.index + 1} 章 ${chapter.title}\n\n`

            if (summary && summary.result) {
                markdown += `### 📝 章节摘要\n\n${summary.result}\n\n`
            }

            if (homophone && Array.isArray(homophone.result) && homophone.result.length > 0) {
                markdown += `### 🔍 谐音识别\n\n`
                markdown += `| 原文 | 推测 | 置信度 |\n`
                markdown += `|------|------|--------|\n`
                for (const item of homophone.result as Array<{ original: string; guess: string | string[]; confidence: number }>) {
                    const confidence = Math.round((item.confidence || 0) * 100)
                    const guessText = Array.isArray(item.guess) ? item.guess.join(' / ') : item.guess
                    markdown += `| ${item.original} | ${guessText} | ${confidence}% |\n`
                }
                markdown += '\n'
            }

            markdown += `---\n\n`
        }
    }

    if (!hasContent) {
        markdown += `> ⚠️ 暂无 AI 分析数据。请先在阅读时使用 AI 功能生成摘要或谐音识别。\n`
    }

    markdown += `\n---\n\n`
    markdown += `*本报告由 Nexus Reader AI 助手生成*\n`

    return markdown
}

/**
 * 下载 Markdown 文件
 * @param content Markdown 内容
 * @param filename 文件名
 */
export function downloadMarkdown(content: string, filename: string) {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename.endsWith('.md') ? filename : `${filename}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
}

/**
 * 获取缓存的分析数据统计
 * @param bookUrl 书籍 URL
 * @param totalChapters 总章节数
 */
export async function getAnalysisStats(bookUrl: string, totalChapters: number) {
    let summaryCached = 0
    let homophoneCached = 0

    for (let i = 0; i < totalChapters; i++) {
        const summary = await getCache(bookUrl, i, 'summary')
        const homophone = await getCache(bookUrl, i, 'homophone')
        if (summary) summaryCached++
        if (homophone) homophoneCached++
    }

    return {
        summaryCached,
        homophoneCached,
        hasCachedData: summaryCached > 0 || homophoneCached > 0,
    }
}
