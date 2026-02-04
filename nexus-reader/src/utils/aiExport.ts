/**
 * AI Export utilities
 *
 * Provides functionality for exporting AI-generated content
 * and insights in various formats.
 */

import { logger } from './logger'

export interface ExportOptions {
  format: 'json' | 'markdown' | 'html' | 'pdf'
  includeMetadata?: boolean
  includeTimestamps?: boolean
  filterByDate?: {
    start: Date
    end: Date
  }
}

export interface AIExportData {
  insights: Array<{
    id: string
    content: string
    timestamp: number
    type: string
    confidence?: number
  }>
  metadata?: {
    exportDate: number
    version: string
    totalInsights: number
  }
}

export class AIExportManager {
  static async exportData(data: AIExportData, options: ExportOptions): Promise<Blob> {
    try {
      logger.info('Starting AI data export', {
        format: options.format,
        insightCount: data.insights.length
      })

      let content: string

      switch (options.format) {
        case 'json':
          content = this.exportAsJson(data, options)
          break
        case 'markdown':
          content = this.exportAsMarkdown(data, options)
          break
        case 'html':
          content = this.exportAsHtml(data, options)
          break
        default:
          throw new Error(`Unsupported export format: ${options.format}`)
      }

      const blob = new Blob([content], {
        type: this.getMimeType(options.format)
      })

      logger.info('AI data export completed', {
        format: options.format,
        size: blob.size
      })

      return blob
    } catch (error) {
      logger.error('AI data export failed', { error: error.message })
      throw error
    }
  }

  private static exportAsJson(data: AIExportData, options: ExportOptions): string {
    const exportData = {
      ...data,
      metadata: options.includeMetadata ? {
        ...data.metadata,
        exportDate: Date.now(),
        format: 'json'
      } : undefined
    }
    return JSON.stringify(exportData, null, 2)
  }

  private static exportAsMarkdown(data: AIExportData, options: ExportOptions): string {
    let content = '# AI Insights Export\n\n'

    if (options.includeMetadata && data.metadata) {
      content += `## Metadata\n\n`
      content += `- Export Date: ${new Date(data.metadata.exportDate).toLocaleString()}\n`
      content += `- Total Insights: ${data.metadata.totalInsights}\n\n`
    }

    content += '## Insights\n\n'

    data.insights.forEach((insight, index) => {
      content += `### ${index + 1}. ${insight.type}\n\n`
      content += `${insight.content}\n\n`

      if (options.includeTimestamps) {
        content += `*Generated: ${new Date(insight.timestamp).toLocaleString()}*\n\n`
      }

      if (insight.confidence !== undefined) {
        content += `*Confidence: ${(insight.confidence * 100).toFixed(1)}%*\n\n`
      }
    })

    return content
  }

  private static exportAsHtml(data: AIExportData, options: ExportOptions): string {
    let content = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Insights Export</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 40px; }
        .insight { margin-bottom: 30px; border-left: 4px solid #007acc; padding-left: 20px; }
        .metadata { background: #f5f5f5; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
        .timestamp { color: #666; font-size: 0.9em; }
        .confidence { color: #007acc; font-weight: bold; }
    </style>
</head>
<body>
    <h1>AI Insights Export</h1>`

    if (options.includeMetadata && data.metadata) {
      content += `
    <div class="metadata">
        <h2>Metadata</h2>
        <p><strong>Export Date:</strong> ${new Date(data.metadata.exportDate).toLocaleString()}</p>
        <p><strong>Total Insights:</strong> ${data.metadata.totalInsights}</p>
    </div>`
    }

    content += '<h2>Insights</h2>'

    data.insights.forEach((insight, index) => {
      content += `
    <div class="insight">
        <h3>${index + 1}. ${insight.type}</h3>
        <p>${insight.content}</p>`

      if (options.includeTimestamps) {
        content += `<p class="timestamp">Generated: ${new Date(insight.timestamp).toLocaleString()}</p>`
      }

      if (insight.confidence !== undefined) {
        content += `<p class="confidence">Confidence: ${(insight.confidence * 100).toFixed(1)}%</p>`
      }

      content += '</div>'
    })

    content += `
</body>
</html>`

    return content
  }

  private static getMimeType(format: string): string {
    switch (format) {
      case 'json':
        return 'application/json'
      case 'markdown':
        return 'text/markdown'
      case 'html':
        return 'text/html'
      default:
        return 'text/plain'
    }
  }

  static downloadFile(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    logger.info('File downloaded', { filename })
  }
}

// Export convenience functions
export const exportAiData = AIExportManager.exportData.bind(AIExportManager)
export const downloadAiExport = AIExportManager.downloadFile.bind(AIExportManager)

// Specific export functions for AI analysis
export const exportAIAnalysis = async (data: {
  bookName: string
  bookUrl: string
  analysis: {
    summary?: string
    homophones?: string[]
    recap?: string
    insights?: Array<{ content: string; type: string }>
  }
}): Promise<string> => {
  const exportData: AIExportData = {
    insights: [],
    metadata: {
      exportDate: Date.now(),
      version: '1.0',
      totalInsights: 0
    }
  }

  // Convert analysis data to insights format
  if (data.analysis.summary) {
    exportData.insights.push({
      id: 'summary',
      content: data.analysis.summary,
      timestamp: Date.now(),
      type: 'summary'
    })
  }

  if (data.analysis.homophones?.length) {
    exportData.insights.push({
      id: 'homophones',
      content: `发现 ${data.analysis.homophones.length} 个多音字：${data.analysis.homophones.join('、')}`,
      timestamp: Date.now(),
      type: 'homophones'
    })
  }

  if (data.analysis.recap) {
    exportData.insights.push({
      id: 'recap',
      content: data.analysis.recap,
      timestamp: Date.now(),
      type: 'recap'
    })
  }

  if (data.analysis.insights?.length) {
    data.analysis.insights.forEach((insight, index) => {
      exportData.insights.push({
        id: `insight-${index}`,
        content: insight.content,
        timestamp: Date.now(),
        type: insight.type
      })
    })
  }

  exportData.metadata!.totalInsights = exportData.insights.length

  // Export as markdown
  return AIExportManager.exportAsMarkdown(exportData, { includeMetadata: true, includeTimestamps: true })
}

export const downloadMarkdown = (content: string, filename: string): void => {
  const blob = new Blob([content], { type: 'text/markdown' })
  AIExportManager.downloadFile(blob, filename)
}

export default AIExportManager