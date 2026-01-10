/**
 * Bundle Analyzer - 包分析工具
 * 分析构建产物，识别大依赖和优化机会
 */

export interface BundleAnalysis {
  totalSize: number
  gzippedSize: number
  chunks: ChunkInfo[]
  dependencies: DependencyInfo[]
  recommendations: OptimizationRecommendation[]
}

export interface ChunkInfo {
  name: string
  size: number
  modules: string[]
  isAsync: boolean
  route?: string
}

export interface DependencyInfo {
  name: string
  size: number
  version: string
  isDevDependency: boolean
  usageCount: number
  importedBy: string[]
}

export interface OptimizationRecommendation {
  type: 'code-split' | 'lazy-load' | 'tree-shake' | 'compress' | 'replace'
  target: string
  potentialSavings: number
  priority: 'high' | 'medium' | 'low'
  description: string
  action?: string
}

// 大依赖阈值 (KB)
const LARGE_DEPENDENCY_THRESHOLD = 100
const CRITICAL_DEPENDENCY_THRESHOLD = 500

// 已知的大依赖库及其优化建议
const KNOWN_LARGE_DEPENDENCIES: Record<string, {
  expectedSize: number
  recommendations: Partial<OptimizationRecommendation>[]
}> = {
  'onnxruntime-web': {
    expectedSize: 5000,
    recommendations: [
      {
        type: 'lazy-load',
        priority: 'high',
        description: 'ONNX Runtime 应该按需加载，只在使用 AI 功能时加载',
        action: 'dynamic-import'
      }
    ]
  },
  'piper-tts-web': {
    expectedSize: 2000,
    recommendations: [
      {
        type: 'lazy-load',
        priority: 'high',
        description: 'TTS 库应该按需加载，只在使用语音功能时加载',
        action: 'dynamic-import'
      }
    ]
  },
  'vue': {
    expectedSize: 100,
    recommendations: [
      {
        type: 'tree-shake',
        priority: 'medium',
        description: '确保只导入使用的 Vue 功能',
        action: 'optimize-imports'
      }
    ]
  },
  'lucide-vue-next': {
    expectedSize: 200,
    recommendations: [
      {
        type: 'tree-shake',
        priority: 'high',
        description: '只导入使用的图标，避免导入整个图标库',
        action: 'selective-import'
      }
    ]
  }
}

class BundleAnalyzerImpl {
  private analysisCache: BundleAnalysis | null = null

  // 从构建统计信息中分析包
  async analyzeBuildStats(statsPath?: string): Promise<BundleAnalysis> {
    if (this.analysisCache) {
      return this.analysisCache
    }

    try {
      // 尝试从不同位置读取构建统计信息
      const stats = await this.loadBuildStats(statsPath)
      if (!stats) {
        return this.createEmptyAnalysis()
      }

      const analysis = await this.performAnalysis(stats)
      this.analysisCache = analysis
      return analysis
    } catch (error) {
      console.error('Bundle analysis failed:', error)
      return this.createEmptyAnalysis()
    }
  }

  // 分析当前运行时的包信息
  analyzeRuntimeBundles(): BundleAnalysis {
    const chunks: ChunkInfo[] = []
    const dependencies: DependencyInfo[] = []
    const recommendations: OptimizationRecommendation[] = []

    // 分析已加载的脚本
    const scripts = document.querySelectorAll('script[src]')
    let totalSize = 0

    scripts.forEach(script => {
      const src = (script as HTMLScriptElement).src
      if (src && !src.includes('node_modules')) {
        const name = this.extractChunkName(src)
        const estimatedSize = this.estimateScriptSize(src)
        
        chunks.push({
          name,
          size: estimatedSize,
          modules: [], // 运行时无法获取模块信息
          isAsync: script.hasAttribute('async') || script.hasAttribute('defer'),
          route: this.guessRouteFromChunkName(name)
        })

        totalSize += estimatedSize
      }
    })

    // 分析已知的大依赖
    this.analyzeLargeDependencies(dependencies, recommendations)

    // 生成通用优化建议
    this.generateGeneralRecommendations(recommendations, totalSize)

    return {
      totalSize,
      gzippedSize: Math.round(totalSize * 0.3), // 估算 gzip 压缩率
      chunks,
      dependencies,
      recommendations
    }
  }

  // 生成包分析报告
  generateReport(analysis: BundleAnalysis): string {
    const report = []
    
    report.push('# 包分析报告')
    report.push(`生成时间: ${new Date().toLocaleString()}`)
    report.push('')
    
    // 总体统计
    report.push('## 总体统计')
    report.push(`- 总大小: ${this.formatSize(analysis.totalSize)}`)
    report.push(`- Gzip 压缩后: ${this.formatSize(analysis.gzippedSize)}`)
    report.push(`- 代码块数量: ${analysis.chunks.length}`)
    report.push(`- 依赖数量: ${analysis.dependencies.length}`)
    report.push('')

    // 最大的代码块
    if (analysis.chunks.length > 0) {
      report.push('## 最大的代码块')
      const sortedChunks = [...analysis.chunks].sort((a, b) => b.size - a.size)
      sortedChunks.slice(0, 10).forEach(chunk => {
        report.push(`- ${chunk.name}: ${this.formatSize(chunk.size)} ${chunk.isAsync ? '(异步)' : '(同步)'}`)
      })
      report.push('')
    }

    // 大依赖
    if (analysis.dependencies.length > 0) {
      const largeDeps = analysis.dependencies.filter(dep => dep.size > LARGE_DEPENDENCY_THRESHOLD)
      if (largeDeps.length > 0) {
        report.push('## 大依赖 (>100KB)')
        largeDeps.forEach(dep => {
          report.push(`- ${dep.name}@${dep.version}: ${this.formatSize(dep.size)}`)
        })
        report.push('')
      }
    }

    // 优化建议
    if (analysis.recommendations.length > 0) {
      report.push('## 优化建议')
      const sortedRecs = [...analysis.recommendations].sort((a, b) => {
        const priorityOrder = { high: 3, medium: 2, low: 1 }
        return priorityOrder[b.priority] - priorityOrder[a.priority]
      })
      
      sortedRecs.forEach((rec, index) => {
        const savings = rec.potentialSavings > 0 ? ` (可节省 ${this.formatSize(rec.potentialSavings)})` : ''
        report.push(`${index + 1}. **${rec.priority.toUpperCase()}** - ${rec.target}${savings}`)
        report.push(`   ${rec.description}`)
        if (rec.action) {
          report.push(`   建议操作: ${rec.action}`)
        }
        report.push('')
      })
    }

    return report.join('\n')
  }

  // 导出分析结果
  exportAnalysis(analysis: BundleAnalysis, format: 'json' | 'html' | 'txt' = 'json') {
    const timestamp = new Date().toISOString().split('T')[0]
    let content: string
    let filename: string
    let mimeType: string

    switch (format) {
      case 'html':
        content = this.generateHTMLReport(analysis)
        filename = `bundle-analysis-${timestamp}.html`
        mimeType = 'text/html'
        break
      case 'txt':
        content = this.generateReport(analysis)
        filename = `bundle-analysis-${timestamp}.txt`
        mimeType = 'text/plain'
        break
      default:
        content = JSON.stringify(analysis, null, 2)
        filename = `bundle-analysis-${timestamp}.json`
        mimeType = 'application/json'
    }

    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  private async loadBuildStats(statsPath?: string): Promise<any> {
    // 尝试从不同位置加载构建统计信息
    const possiblePaths = [
      statsPath,
      '/dist/stats.json',
      '/build/stats.json',
      './stats.json'
    ].filter(Boolean)

    for (const path of possiblePaths) {
      try {
        const response = await fetch(path!)
        if (response.ok) {
          return await response.json()
        }
      } catch (error) {
        // 继续尝试下一个路径
      }
    }

    return null
  }

  private async performAnalysis(stats: any): Promise<BundleAnalysis> {
    const chunks: ChunkInfo[] = []
    const dependencies: DependencyInfo[] = []
    const recommendations: OptimizationRecommendation[] = []

    // 分析代码块
    if (stats.chunks) {
      stats.chunks.forEach((chunk: any) => {
        chunks.push({
          name: chunk.name || chunk.id,
          size: chunk.size || 0,
          modules: chunk.modules?.map((m: any) => m.name || m.identifier) || [],
          isAsync: !chunk.initial,
          route: this.guessRouteFromChunkName(chunk.name)
        })
      })
    }

    // 分析依赖
    if (stats.modules) {
      const depMap = new Map<string, DependencyInfo>()
      
      stats.modules.forEach((module: any) => {
        const depName = this.extractDependencyName(module.name || module.identifier)
        if (depName && depName !== '.') {
          if (depMap.has(depName)) {
            const dep = depMap.get(depName)!
            dep.size += module.size || 0
            dep.usageCount += 1
          } else {
            depMap.set(depName, {
              name: depName,
              size: module.size || 0,
              version: 'unknown',
              isDevDependency: false,
              usageCount: 1,
              importedBy: []
            })
          }
        }
      })

      dependencies.push(...Array.from(depMap.values()))
    }

    // 生成优化建议
    this.generateOptimizationRecommendations(chunks, dependencies, recommendations)

    const totalSize = chunks.reduce((sum, chunk) => sum + chunk.size, 0)
    const gzippedSize = Math.round(totalSize * 0.3)

    return {
      totalSize,
      gzippedSize,
      chunks,
      dependencies,
      recommendations
    }
  }

  private generateOptimizationRecommendations(
    chunks: ChunkInfo[],
    dependencies: DependencyInfo[],
    recommendations: OptimizationRecommendation[]
  ) {
    // 检查大代码块
    chunks.forEach(chunk => {
      if (chunk.size > CRITICAL_DEPENDENCY_THRESHOLD * 1024) {
        recommendations.push({
          type: 'code-split',
          target: chunk.name,
          potentialSavings: chunk.size * 0.5,
          priority: 'high',
          description: `代码块 ${chunk.name} 过大，建议进一步拆分`,
          action: 'split-chunk'
        })
      }
    })

    // 检查大依赖
    dependencies.forEach(dep => {
      if (dep.size > LARGE_DEPENDENCY_THRESHOLD * 1024) {
        const knownDep = KNOWN_LARGE_DEPENDENCIES[dep.name]
        if (knownDep) {
          knownDep.recommendations.forEach(rec => {
            recommendations.push({
              ...rec,
              target: dep.name,
              potentialSavings: dep.size * 0.7,
            } as OptimizationRecommendation)
          })
        } else {
          recommendations.push({
            type: 'lazy-load',
            target: dep.name,
            potentialSavings: dep.size * 0.5,
            priority: dep.size > CRITICAL_DEPENDENCY_THRESHOLD * 1024 ? 'high' : 'medium',
            description: `依赖 ${dep.name} 较大，考虑按需加载`,
            action: 'dynamic-import'
          })
        }
      }
    })

    // 检查同步代码块
    const syncChunks = chunks.filter(chunk => !chunk.isAsync && chunk.size > 50 * 1024)
    if (syncChunks.length > 3) {
      recommendations.push({
        type: 'code-split',
        target: 'initial-chunks',
        potentialSavings: syncChunks.reduce((sum, chunk) => sum + chunk.size, 0) * 0.3,
        priority: 'medium',
        description: '初始加载的同步代码块过多，建议增加异步加载',
        action: 'async-chunks'
      })
    }
  }

  private analyzeLargeDependencies(
    dependencies: DependencyInfo[],
    recommendations: OptimizationRecommendation[]
  ) {
    // 基于已知的大依赖生成建议
    Object.entries(KNOWN_LARGE_DEPENDENCIES).forEach(([name, info]) => {
      // 检查是否在当前页面中使用
      if (this.isDependencyLoaded(name)) {
        dependencies.push({
          name,
          size: info.expectedSize * 1024,
          version: 'runtime',
          isDevDependency: false,
          usageCount: 1,
          importedBy: ['runtime']
        })

        info.recommendations.forEach(rec => {
          recommendations.push({
            ...rec,
            target: name,
            potentialSavings: info.expectedSize * 1024 * 0.7,
          } as OptimizationRecommendation)
        })
      }
    })
  }

  private generateGeneralRecommendations(
    recommendations: OptimizationRecommendation[],
    totalSize: number
  ) {
    // 如果总大小超过阈值，给出通用建议
    if (totalSize > 1000 * 1024) { // 1MB
      recommendations.push({
        type: 'compress',
        target: 'all-assets',
        potentialSavings: totalSize * 0.3,
        priority: 'medium',
        description: '启用 Brotli/Gzip 压缩可以显著减少传输大小',
        action: 'enable-compression'
      })
    }

    // 检查是否有未使用的功能
    if (this.hasUnusedFeatures()) {
      recommendations.push({
        type: 'tree-shake',
        target: 'unused-features',
        potentialSavings: totalSize * 0.2,
        priority: 'low',
        description: '移除未使用的功能和依赖',
        action: 'tree-shake'
      })
    }
  }

  private generateHTMLReport(analysis: BundleAnalysis): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Bundle Analysis Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .metric { background: #f5f5f5; padding: 10px; margin: 10px 0; border-radius: 5px; }
        .recommendation { border-left: 4px solid #007acc; padding: 10px; margin: 10px 0; }
        .high { border-left-color: #d73a49; }
        .medium { border-left-color: #f66a0a; }
        .low { border-left-color: #28a745; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
    </style>
</head>
<body>
    <h1>Bundle Analysis Report</h1>
    <p>Generated: ${new Date().toLocaleString()}</p>
    
    <div class="metric">
        <h3>总体统计</h3>
        <p>总大小: ${this.formatSize(analysis.totalSize)}</p>
        <p>Gzip 压缩后: ${this.formatSize(analysis.gzippedSize)}</p>
        <p>代码块数量: ${analysis.chunks.length}</p>
        <p>依赖数量: ${analysis.dependencies.length}</p>
    </div>

    <h2>代码块分析</h2>
    <table>
        <tr><th>名称</th><th>大小</th><th>类型</th><th>路由</th></tr>
        ${analysis.chunks.map(chunk => `
            <tr>
                <td>${chunk.name}</td>
                <td>${this.formatSize(chunk.size)}</td>
                <td>${chunk.isAsync ? '异步' : '同步'}</td>
                <td>${chunk.route || '-'}</td>
            </tr>
        `).join('')}
    </table>

    <h2>优化建议</h2>
    ${analysis.recommendations.map(rec => `
        <div class="recommendation ${rec.priority}">
            <h4>${rec.target} (${rec.priority.toUpperCase()})</h4>
            <p>${rec.description}</p>
            ${rec.potentialSavings > 0 ? `<p>可节省: ${this.formatSize(rec.potentialSavings)}</p>` : ''}
            ${rec.action ? `<p>建议操作: ${rec.action}</p>` : ''}
        </div>
    `).join('')}
</body>
</html>
    `
  }

  private createEmptyAnalysis(): BundleAnalysis {
    return {
      totalSize: 0,
      gzippedSize: 0,
      chunks: [],
      dependencies: [],
      recommendations: []
    }
  }

  private extractChunkName(src: string): string {
    const match = src.match(/\/([^\/]+)\.js$/)
    return match ? match[1] : 'unknown'
  }

  private extractDependencyName(identifier: string): string {
    const match = identifier.match(/node_modules[\/\\]([^\/\\]+)/)
    return match ? match[1] : ''
  }

  private guessRouteFromChunkName(name: string): string | undefined {
    if (name.includes('reader')) return '/reader'
    if (name.includes('search')) return '/search'
    if (name.includes('settings')) return '/settings'
    if (name.includes('ai')) return '/ai'
    return undefined
  }

  private estimateScriptSize(src: string): number {
    // 基于文件名估算大小（实际应用中可以通过 Resource Timing API 获取）
    if (src.includes('lib-')) return 200 * 1024 // 库文件通常较大
    if (src.includes('async')) return 50 * 1024  // 异步块中等大小
    return 100 * 1024 // 默认估算
  }

  private isDependencyLoaded(name: string): boolean {
    // 检查是否有相关的脚本标签或全局变量
    const scripts = Array.from(document.querySelectorAll('script[src]'))
    return scripts.some(script => 
      (script as HTMLScriptElement).src.includes(name)
    )
  }

  private hasUnusedFeatures(): boolean {
    // 简单检查：如果页面上没有某些功能的 DOM 元素，可能未使用
    const features = [
      { name: 'ai', selector: '[data-ai]' },
      { name: 'tts', selector: '[data-tts]' },
      { name: 'search', selector: '[data-search]' }
    ]

    return features.some(feature => 
      !document.querySelector(feature.selector)
    )
  }

  private formatSize(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }
}

// 创建全局实例
export const bundleAnalyzer = new BundleAnalyzerImpl()

// 便捷函数
export async function analyzeBundles(): Promise<BundleAnalysis> {
  return bundleAnalyzer.analyzeRuntimeBundles()
}

export async function generateBundleReport(): Promise<string> {
  const analysis = await analyzeBundles()
  return bundleAnalyzer.generateReport(analysis)
}

export async function exportBundleAnalysis(format: 'json' | 'html' | 'txt' = 'json') {
  const analysis = await analyzeBundles()
  bundleAnalyzer.exportAnalysis(analysis, format)
}