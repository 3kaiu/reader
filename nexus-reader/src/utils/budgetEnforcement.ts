/**
 * Budget Enforcement - 预算执行器
 * 在构建时和运行时强制执行性能预算
 */

import { performanceBudgetManager, type BudgetViolation } from './performanceBudget'
import { secureRandomString } from './secureRandom'

// 构建时预算配置
export interface BuildTimeBudgetConfig {
  enforceOnBuild: boolean
  failOnViolation: boolean
  warningThreshold: number
  errorThreshold: number
  outputPath: string
  reportFormat: 'json' | 'html' | 'console'
}

// 构建报告接口
export interface BuildBudgetReport {
  timestamp: number
  buildId: string
  passed: boolean
  violations: BudgetViolation[]
  bundleAnalysis: BundleAnalysis
  recommendations: string[]
  score: number
}

// 包分析接口
export interface BundleAnalysis {
  totalSize: number
  initialSize: number
  chunks: ChunkInfo[]
  assets: AssetInfo[]
  dependencies: DependencyInfo[]
}

export interface ChunkInfo {
  name: string
  size: number
  files: string[]
  modules: number
}

export interface AssetInfo {
  name: string
  size: number
  type: string
  compressed?: number
}

export interface DependencyInfo {
  name: string
  size: number
  version: string
  isDevDependency: boolean
}

/**
 * 构建时预算执行器
 */
export class BuildTimeBudgetEnforcer {
  private config: BuildTimeBudgetConfig

  constructor(config?: Partial<BuildTimeBudgetConfig>) {
    this.config = {
      enforceOnBuild: true,
      failOnViolation: false,
      warningThreshold: 0.8,
      errorThreshold: 1.0,
      outputPath: './performance-budget-report.json',
      reportFormat: 'json',
      ...config
    }
  }

  // 分析构建结果
  async analyzeBuild(stats: any): Promise<BuildBudgetReport> {
    const buildId = this.generateBuildId()
    const timestamp = Date.now()

    console.log('📊 Analyzing build for performance budget compliance...')

    try {
      // 分析包大小
      const bundleAnalysis = this.analyzeBundleSize(stats)

      // 检查预算违规
      const budgetResult = await this.checkBuildBudgets(bundleAnalysis)

      // 生成报告
      const report: BuildBudgetReport = {
        timestamp,
        buildId,
        passed: budgetResult.passed,
        violations: budgetResult.violations,
        bundleAnalysis,
        recommendations: budgetResult.recommendations,
        score: budgetResult.score
      }

      // 输出报告
      await this.outputReport(report)

      // 根据配置决定是否失败构建
      if (!report.passed && this.config.failOnViolation) {
        throw new Error(`Build failed due to performance budget violations: ${report.violations.length} violations found`)
      }

      return report

    } catch (error) {
      console.error('❌ Build budget analysis failed:', error)
      throw error
    }
  }

  // 分析包大小
  private analyzeBundleSize(stats: any): BundleAnalysis {
    const compilation = stats.compilation || stats
    const assets = compilation.assets || {}
    const chunks = compilation.chunks || []

    // 分析资源
    const assetInfos: AssetInfo[] = Object.entries(assets).map(([name, asset]: [string, any]) => ({
      name,
      size: asset.size(),
      type: this.getAssetType(name),
      compressed: asset.compressed?.size()
    }))

    // 分析代码块
    const chunkInfos: ChunkInfo[] = Array.from(chunks).map((chunk: any) => ({
      name: chunk.name || chunk.id,
      size: chunk.size || 0,
      files: Array.from(chunk.files || []),
      modules: chunk.getNumberOfModules ? chunk.getNumberOfModules() : 0
    }))

    // 计算总大小
    const totalSize = assetInfos.reduce((sum, asset) => sum + asset.size, 0)
    const initialSize = this.calculateInitialSize(chunkInfos, assetInfos)

    // 分析依赖（需要额外的包分析工具）
    const dependencies = this.analyzeDependencies(compilation)

    return {
      totalSize,
      initialSize,
      chunks: chunkInfos,
      assets: assetInfos,
      dependencies
    }
  }

  // 检查构建预算
  private async checkBuildBudgets(bundleAnalysis: BundleAnalysis): Promise<{
    passed: boolean
    violations: BudgetViolation[]
    recommendations: string[]
    score: number
  }> {
    const violations: BudgetViolation[] = []
    const config = performanceBudgetManager.getConfig()

    // 检查初始包大小
    if (bundleAnalysis.initialSize > config.bundleSize.initial) {
      violations.push({
        type: 'bundle-size',
        metric: 'initial',
        actual: bundleAnalysis.initialSize,
        budget: config.bundleSize.initial,
        severity: this.getSeverity(bundleAnalysis.initialSize, config.bundleSize.initial),
        timestamp: Date.now(),
        context: { buildTime: true }
      })
    }

    // 检查总包大小
    if (bundleAnalysis.totalSize > config.bundleSize.total) {
      violations.push({
        type: 'bundle-size',
        metric: 'total',
        actual: bundleAnalysis.totalSize,
        budget: config.bundleSize.total,
        severity: this.getSeverity(bundleAnalysis.totalSize, config.bundleSize.total),
        timestamp: Date.now(),
        context: { buildTime: true }
      })
    }

    // 检查单个代码块大小
    bundleAnalysis.chunks.forEach(chunk => {
      if (chunk.size > config.bundleSize.perRoute) {
        violations.push({
          type: 'bundle-size',
          metric: 'perRoute',
          actual: chunk.size,
          budget: config.bundleSize.perRoute,
          severity: this.getSeverity(chunk.size, config.bundleSize.perRoute),
          timestamp: Date.now(),
          context: { buildTime: true, chunkName: chunk.name }
        })
      }
    })

    // 生成建议
    const recommendations = this.generateBuildRecommendations(violations, bundleAnalysis)

    // 计算分数
    const score = this.calculateBuildScore(violations)

    return {
      passed: violations.length === 0,
      violations,
      recommendations,
      score
    }
  }

  // 输出报告
  private async outputReport(report: BuildBudgetReport): Promise<void> {
    try {
      switch (this.config.reportFormat) {
        case 'json':
          await this.outputJsonReport(report)
          break
        case 'html':
          await this.outputHtmlReport(report)
          break
        case 'console':
          this.outputConsoleReport(report)
          break
      }
    } catch (error) {
      console.error('Failed to output budget report:', error)
    }
  }

  // 输出JSON报告 - 浏览器兼容版本
  private async outputJsonReport(report: BuildBudgetReport): Promise<void> {
    // 在浏览器环境中，我们不能直接写文件
    if (typeof window !== 'undefined') {
      console.warn('File system not available in browser, skipping JSON report')
      // 将报告存储到localStorage作为替代
      localStorage.setItem('performance-budget-report', JSON.stringify(report, null, 2))
      return
    }

    // Node.js环境下的文件操作（构建时）
    try {
      if (typeof window === 'undefined') {
        // Use dynamic import with a variable to skip static analysis by bundlers
        const fsModule = 'fs'
        const fs = await import(fsModule)
        const reportJson = JSON.stringify(report, null, 2)
        fs.writeFileSync(this.config.outputPath, reportJson)
        console.log(`📊 Budget report saved to: ${this.config.outputPath}`)
      }
    } catch (error) {
      console.warn('Failed to write JSON report:', error)
    }
  }

  // 输出HTML报告 - 浏览器兼容版本
  private async outputHtmlReport(report: BuildBudgetReport): Promise<void> {
    const htmlContent = this.generateHtmlReport(report)
    const htmlPath = this.config.outputPath.replace('.json', '.html')

    // 在浏览器环境中跳过文件操作
    if (typeof window !== 'undefined') {
      console.warn('File system not available in browser, skipping HTML report')
      return
    }

    try {
      if (typeof window === 'undefined') {
        const fsModule = 'fs'
        const fs = await import(fsModule)
        fs.writeFileSync(htmlPath, htmlContent)
        console.log(`📊 HTML budget report saved to: ${htmlPath}`)
      }
    } catch (error) {
      console.warn('Failed to write HTML report:', error)
    }
  }

  // 输出控制台报告
  private outputConsoleReport(report: BuildBudgetReport): void {
    console.log('\n📊 Performance Budget Report')
    console.log('='.repeat(50))
    console.log(`Build ID: ${report.buildId}`)
    console.log(`Timestamp: ${new Date(report.timestamp).toISOString()}`)
    console.log(`Status: ${report.passed ? '✅ PASSED' : '❌ FAILED'}`)
    console.log(`Score: ${report.score}/100`)
    console.log(`Total Size: ${this.formatBytes(report.bundleAnalysis.totalSize)}`)
    console.log(`Initial Size: ${this.formatBytes(report.bundleAnalysis.initialSize)}`)

    if (report.violations.length > 0) {
      console.log('\n⚠️ Budget Violations:')
      report.violations.forEach((violation, index) => {
        console.log(`  ${index + 1}. ${violation.type}/${violation.metric}: ${this.formatBytes(violation.actual)} > ${this.formatBytes(violation.budget)} (${violation.severity})`)
      })
    }

    if (report.recommendations.length > 0) {
      console.log('\n💡 Recommendations:')
      report.recommendations.forEach((rec, index) => {
        console.log(`  ${index + 1}. ${rec}`)
      })
    }

    console.log('='.repeat(50))
  }

  // 生成HTML报告
  private generateHtmlReport(report: BuildBudgetReport): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Performance Budget Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 5px; }
        .status.passed { color: green; }
        .status.failed { color: red; }
        .violation { background: #fff3cd; padding: 10px; margin: 5px 0; border-radius: 3px; }
        .violation.critical { background: #f8d7da; }
        .violation.error { background: #f8d7da; }
        .recommendation { background: #d1ecf1; padding: 10px; margin: 5px 0; border-radius: 3px; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Performance Budget Report</h1>
        <p><strong>Build ID:</strong> ${report.buildId}</p>
        <p><strong>Timestamp:</strong> ${new Date(report.timestamp).toISOString()}</p>
        <p><strong>Status:</strong> <span class="status ${report.passed ? 'passed' : 'failed'}">${report.passed ? 'PASSED' : 'FAILED'}</span></p>
        <p><strong>Score:</strong> ${report.score}/100</p>
    </div>

    <h2>Bundle Analysis</h2>
    <p><strong>Total Size:</strong> ${this.formatBytes(report.bundleAnalysis.totalSize)}</p>
    <p><strong>Initial Size:</strong> ${this.formatBytes(report.bundleAnalysis.initialSize)}</p>

    ${report.violations.length > 0 ? `
    <h2>Budget Violations</h2>
    ${report.violations.map(v => `
    <div class="violation ${v.severity}">
        <strong>${v.type}/${v.metric}:</strong> ${this.formatBytes(v.actual)} > ${this.formatBytes(v.budget)} (${v.severity})
    </div>
    `).join('')}
    ` : ''}

    ${report.recommendations.length > 0 ? `
    <h2>Recommendations</h2>
    ${report.recommendations.map(rec => `<div class="recommendation">${rec}</div>`).join('')}
    ` : ''}

    <h2>Assets</h2>
    <table>
        <tr><th>Name</th><th>Size</th><th>Type</th><th>Compressed</th></tr>
        ${report.bundleAnalysis.assets.map(asset => `
        <tr>
            <td>${asset.name}</td>
            <td>${this.formatBytes(asset.size)}</td>
            <td>${asset.type}</td>
            <td>${asset.compressed ? this.formatBytes(asset.compressed) : 'N/A'}</td>
        </tr>
        `).join('')}
    </table>
</body>
</html>
    `
  }

  // 辅助方法
  private generateBuildId(): string {
    return `build_${Date.now()}_${secureRandomString(6)}`
  }

  private getAssetType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase()
    const typeMap: Record<string, string> = {
      'js': 'javascript',
      'css': 'stylesheet',
      'png': 'image',
      'jpg': 'image',
      'jpeg': 'image',
      'gif': 'image',
      'svg': 'image',
      'woff': 'font',
      'woff2': 'font',
      'ttf': 'font',
      'eot': 'font'
    }
    return typeMap[ext || ''] || 'other'
  }

  private calculateInitialSize(chunks: ChunkInfo[], assets: AssetInfo[]): number {
    // 计算初始加载所需的资源大小
    const initialChunks = chunks.filter(chunk =>
      chunk.name === 'main' ||
      chunk.name === 'runtime' ||
      chunk.name === 'vendor'
    )

    return initialChunks.reduce((sum, chunk) => sum + chunk.size, 0)
  }

  private analyzeDependencies(compilation: any): DependencyInfo[] {
    // 简化的依赖分析，实际应用中需要更复杂的实现
    return []
  }

  private getSeverity(actual: number, budget: number): 'warning' | 'error' | 'critical' {
    const ratio = actual / budget
    if (ratio >= 1.5) return 'critical'
    if (ratio >= 1.2) return 'error'
    return 'warning'
  }

  private generateBuildRecommendations(violations: BudgetViolation[], bundleAnalysis: BundleAnalysis): string[] {
    const recommendations: string[] = []

    if (violations.some(v => v.type === 'bundle-size')) {
      recommendations.push('启用代码分割以减少初始包大小')
      recommendations.push('移除未使用的依赖和代码')
      recommendations.push('启用 tree shaking 优化')
      recommendations.push('使用动态导入进行懒加载')
    }

    // 分析大型资源
    const largeAssets = bundleAnalysis.assets.filter(asset => asset.size > 100 * 1024)
    if (largeAssets.length > 0) {
      recommendations.push(`优化大型资源: ${largeAssets.map(a => a.name).join(', ')}`)
    }

    // 分析大型代码块
    const largeChunks = bundleAnalysis.chunks.filter(chunk => chunk.size > 200 * 1024)
    if (largeChunks.length > 0) {
      recommendations.push(`拆分大型代码块: ${largeChunks.map(c => c.name).join(', ')}`)
    }

    return recommendations
  }

  private calculateBuildScore(violations: BudgetViolation[]): number {
    if (violations.length === 0) return 100

    let totalPenalty = 0
    violations.forEach(violation => {
      const penalty = violation.severity === 'critical' ? 25 :
        violation.severity === 'error' ? 15 : 8
      totalPenalty += penalty
    })

    return Math.max(0, 100 - totalPenalty)
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }
}

/**
 * 运行时预算执行器
 */
export class RuntimeBudgetEnforcer {
  private violations: BudgetViolation[] = []
  private listeners: Array<(violation: BudgetViolation) => void> = []

  constructor() {
    this.startMonitoring()
  }

  // 开始运行时监控
  startMonitoring(): void {
    // 监听性能预算违规
    performanceBudgetManager.addViolationListener(this.handleViolation.bind(this))

    // 定期检查预算
    setInterval(() => {
      this.checkRuntimeBudgets()
    }, 30000) // 每30秒检查一次

    console.log('🚨 Runtime budget enforcement started')
  }

  // 检查运行时预算
  private async checkRuntimeBudgets(): Promise<void> {
    try {
      const result = await performanceBudgetManager.checkBudgets()

      if (!result.passed) {
        console.warn(`🚨 Runtime budget violations detected: ${result.violations.length} violations`)

        // 触发警告或采取纠正措施
        this.handleRuntimeViolations(result.violations)
      }
    } catch (error) {
      console.error('Runtime budget check failed:', error)
    }
  }

  // 处理违规
  private handleViolation(violation: BudgetViolation): void {
    this.violations.push(violation)

    // 通知监听器
    this.listeners.forEach(listener => {
      try {
        listener(violation)
      } catch (error) {
        console.error('Violation listener error:', error)
      }
    })

    // 根据严重程度采取行动
    switch (violation.severity) {
      case 'critical':
        this.handleCriticalViolation(violation)
        break
      case 'error':
        this.handleErrorViolation(violation)
        break
      case 'warning':
        this.handleWarningViolation(violation)
        break
    }
  }

  // 处理运行时违规
  private handleRuntimeViolations(violations: BudgetViolation[]): void {
    violations.forEach(violation => {
      this.handleViolation(violation)
    })
  }

  // 处理严重违规
  private handleCriticalViolation(violation: BudgetViolation): void {
    console.error('🚨 CRITICAL performance budget violation:', violation)

    // 可以采取紧急措施，如清理缓存、减少功能等
    if (violation.type === 'memory') {
      this.triggerMemoryCleanup()
    }
  }

  // 处理错误级违规
  private handleErrorViolation(violation: BudgetViolation): void {
    console.warn('⚠️ ERROR performance budget violation:', violation)

    // 可以降级某些功能
    if (violation.type === 'network') {
      this.enableDataSavingMode()
    }
  }

  // 处理警告级违规
  private handleWarningViolation(violation: BudgetViolation): void {
    console.info('ℹ️ WARNING performance budget violation:', violation)

    // 记录警告，可能显示用户提示
  }

  // 触发内存清理
  private triggerMemoryCleanup(): void {
    // 清理缓存
    if (window.caches) {
      window.caches.keys().then(names => {
        names.forEach(name => {
          if (name.includes('temp') || name.includes('old')) {
            window.caches.delete(name)
          }
        })
      })
    }

    // 触发垃圾回收提示
    if (window.gc) {
      window.gc()
    }

    console.log('🧹 Emergency memory cleanup triggered')
  }

  // 启用数据节省模式
  private enableDataSavingMode(): void {
    // 降低图片质量
    // 减少预加载
    // 启用更激进的缓存策略
    console.log('📱 Data saving mode enabled due to network budget violation')
  }

  // 添加违规监听器
  addViolationListener(listener: (violation: BudgetViolation) => void): void {
    this.listeners.push(listener)
  }

  // 移除违规监听器
  removeViolationListener(listener: (violation: BudgetViolation) => void): void {
    const index = this.listeners.indexOf(listener)
    if (index > -1) {
      this.listeners.splice(index, 1)
    }
  }

  // 获取违规历史
  getViolationHistory(): BudgetViolation[] {
    return [...this.violations]
  }
}

// 全局实例
export const buildTimeBudgetEnforcer = new BuildTimeBudgetEnforcer()
export const runtimeBudgetEnforcer = new RuntimeBudgetEnforcer()

// 便捷函数
export function analyzeBuildBudget(stats: any): Promise<BuildBudgetReport> {
  return buildTimeBudgetEnforcer.analyzeBuild(stats)
}

export function getRuntimeViolations(): BudgetViolation[] {
  return runtimeBudgetEnforcer.getViolationHistory()
}

// 类型声明扩展
declare global {
  interface Window {
    gc?: () => void
    caches?: CacheStorage
  }
}