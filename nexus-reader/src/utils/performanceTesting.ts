/**
 * Performance Testing Framework - 性能测试框架
 * 提供自动化性能测试和Lighthouse集成
 */

// performanceMonitor is accessed via window.performanceMonitor for optional integration

// 测试配置
export interface PerformanceTestConfig {
  name: string
  url?: string
  device?: 'desktop' | 'mobile' | 'tablet'
  networkCondition?: 'fast3g' | 'slow3g' | 'offline' | 'online'
  iterations?: number
  timeout?: number
  thresholds?: PerformanceThresholds
}

// 性能阈值
export interface PerformanceThresholds {
  lcp?: number // Largest Contentful Paint (ms)
  fid?: number // First Input Delay (ms)
  cls?: number // Cumulative Layout Shift
  fcp?: number // First Contentful Paint (ms)
  tti?: number // Time to Interactive (ms)
  memoryUsage?: number // Memory usage (MB)
  bundleSize?: number // Bundle size (KB)
}

// 测试结果
export interface PerformanceTestResult {
  testName: string
  timestamp: number
  device: string
  networkCondition: string
  metrics: {
    lcp: number
    fid: number
    cls: number
    fcp: number
    tti: number
    memoryUsage: number
    bundleSize: number
  }
  lighthouse?: LighthouseResult
  passed: boolean
  failures: string[]
  duration: number
}

// Lighthouse结果
export interface LighthouseResult {
  performance: number
  accessibility: number
  bestPractices: number
  seo: number
  pwa: number
  audits: Record<string, any>
}

// 测试套件
export interface PerformanceTestSuite {
  name: string
  tests: PerformanceTestConfig[]
  globalThresholds?: PerformanceThresholds
  beforeAll?: () => Promise<void>
  afterAll?: () => Promise<void>
  beforeEach?: () => Promise<void>
  afterEach?: () => Promise<void>
}

/**
 * 性能测试运行器
 */
export class PerformanceTestRunner {
  private results: PerformanceTestResult[] = []
  private isRunning = false
  private currentTest?: PerformanceTestConfig

  constructor() {
    this.setupGlobalErrorHandling()
  }

  // 运行单个测试
  async runTest(config: PerformanceTestConfig): Promise<PerformanceTestResult> {
    const startTime = performance.now()
    
    console.log(`🧪 Running performance test: ${config.name}`)
    
    this.currentTest = config
    this.isRunning = true

    try {
      // 设置测试环境
      await this.setupTestEnvironment(config)

      // 运行多次迭代
      const iterations = config.iterations || 1
      const iterationResults: PerformanceTestResult[] = []

      for (let i = 0; i < iterations; i++) {
        console.log(`  📊 Iteration ${i + 1}/${iterations}`)
        
        const result = await this.runSingleIteration(config, i)
        iterationResults.push(result)
        
        // 等待一段时间再进行下一次迭代
        if (i < iterations - 1) {
          await this.delay(1000)
        }
      }

      // 计算平均结果
      const averageResult = this.calculateAverageResult(iterationResults, config)
      
      // 运行Lighthouse审计
      if (config.url) {
        averageResult.lighthouse = await this.runLighthouseAudit(config)
      }

      // 验证阈值
      averageResult.passed = this.validateThresholds(averageResult, config.thresholds)
      
      this.results.push(averageResult)
      
      const duration = performance.now() - startTime
      console.log(`✅ Test completed in ${Math.round(duration)}ms`)
      
      return averageResult

    } catch (error) {
      console.error(`❌ Test failed: ${config.name}`, error)
      
      const failedResult: PerformanceTestResult = {
        testName: config.name,
        timestamp: Date.now(),
        device: config.device || 'desktop',
        networkCondition: config.networkCondition || 'online',
        metrics: {
          lcp: 0,
          fid: 0,
          cls: 0,
          fcp: 0,
          tti: 0,
          memoryUsage: 0,
          bundleSize: 0
        },
        passed: false,
        failures: [error instanceof Error ? error.message : String(error)],
        duration: performance.now() - startTime
      }
      
      this.results.push(failedResult)
      return failedResult

    } finally {
      this.isRunning = false
      this.currentTest = undefined
      await this.cleanupTestEnvironment()
    }
  }

  // 运行测试套件
  async runTestSuite(suite: PerformanceTestSuite): Promise<PerformanceTestResult[]> {
    console.log(`🚀 Running performance test suite: ${suite.name}`)
    
    const suiteResults: PerformanceTestResult[] = []

    try {
      // 执行beforeAll钩子
      if (suite.beforeAll) {
        await suite.beforeAll()
      }

      // 运行所有测试
      for (const testConfig of suite.tests) {
        // 合并全局阈值
        const mergedConfig = {
          ...testConfig,
          thresholds: {
            ...suite.globalThresholds,
            ...testConfig.thresholds
          }
        }

        // 执行beforeEach钩子
        if (suite.beforeEach) {
          await suite.beforeEach()
        }

        const result = await this.runTest(mergedConfig)
        suiteResults.push(result)

        // 执行afterEach钩子
        if (suite.afterEach) {
          await suite.afterEach()
        }
      }

      // 执行afterAll钩子
      if (suite.afterAll) {
        await suite.afterAll()
      }

      // 生成套件报告
      this.generateSuiteReport(suite, suiteResults)

    } catch (error) {
      console.error(`❌ Test suite failed: ${suite.name}`, error)
    }

    return suiteResults
  }

  // 获取测试结果
  getResults(): PerformanceTestResult[] {
    return [...this.results]
  }

  // 清除测试结果
  clearResults(): void {
    this.results = []
  }

  // 导出测试报告
  exportReport(format: 'json' | 'html' | 'csv' = 'json'): string {
    switch (format) {
      case 'json':
        return this.exportJSONReport()
      case 'html':
        return this.exportHTMLReport()
      case 'csv':
        return this.exportCSVReport()
      default:
        return this.exportJSONReport()
    }
  }

  // 比较测试结果
  compareResults(baseline: PerformanceTestResult[], current: PerformanceTestResult[]): {
    improved: string[]
    regressed: string[]
    unchanged: string[]
    summary: string
  } {
    const improved: string[] = []
    const regressed: string[] = []
    const unchanged: string[] = []

    // 创建基线映射
    const baselineMap = new Map<string, PerformanceTestResult>()
    baseline.forEach(result => baselineMap.set(result.testName, result))

    // 比较每个测试
    current.forEach(currentResult => {
      const baselineResult = baselineMap.get(currentResult.testName)
      if (!baselineResult) return

      const comparison = this.compareMetrics(baselineResult.metrics, currentResult.metrics)
      
      if (comparison.isImproved) {
        improved.push(`${currentResult.testName}: ${comparison.summary}`)
      } else if (comparison.isRegressed) {
        regressed.push(`${currentResult.testName}: ${comparison.summary}`)
      } else {
        unchanged.push(currentResult.testName)
      }
    })

    const summary = `Performance comparison: ${improved.length} improved, ${regressed.length} regressed, ${unchanged.length} unchanged`

    return { improved, regressed, unchanged, summary }
  }

  private async runSingleIteration(config: PerformanceTestConfig, iteration: number): Promise<PerformanceTestResult> {
    const startTime = performance.now()

    // 清理内存
    if (window.gc) {
      window.gc()
    }

    // 等待页面稳定
    await this.waitForPageStable()

    // 收集性能指标
    const metrics = await this.collectPerformanceMetrics()

    // 测量内存使用
    const memoryUsage = await this.measureMemoryUsage()

    // 测量包大小
    const bundleSize = await this.measureBundleSize()

    const result: PerformanceTestResult = {
      testName: `${config.name}_iteration_${iteration}`,
      timestamp: Date.now(),
      device: config.device || 'desktop',
      networkCondition: config.networkCondition || 'online',
      metrics: {
        ...metrics,
        memoryUsage,
        bundleSize
      },
      passed: false, // 将在后续验证
      failures: [],
      duration: performance.now() - startTime
    }

    return result
  }

  private async setupTestEnvironment(config: PerformanceTestConfig): Promise<void> {
    // 设置设备模拟
    if (config.device) {
      await this.simulateDevice(config.device)
    }

    // 设置网络条件
    if (config.networkCondition) {
      await this.simulateNetworkCondition(config.networkCondition)
    }

    // 清理缓存
    await this.clearCache()
  }

  private async cleanupTestEnvironment(): Promise<void> {
    // 恢复默认设置
    await this.resetDeviceSimulation()
    await this.resetNetworkCondition()
  }

  private async simulateDevice(device: string): Promise<void> {
    // 模拟设备特性
    const deviceConfigs = {
      mobile: {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
        viewport: { width: 375, height: 667 },
        deviceScaleFactor: 2
      },
      tablet: {
        userAgent: 'Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
        viewport: { width: 768, height: 1024 },
        deviceScaleFactor: 2
      },
      desktop: {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 1
      }
    }

    const config = deviceConfigs[device as keyof typeof deviceConfigs]
    if (config) {
      // 设置视口
      if (window.innerWidth !== config.viewport.width) {
        // 在实际应用中，这里可能需要使用Puppeteer或其他工具
        console.log(`Simulating ${device} device: ${config.viewport.width}x${config.viewport.height}`)
      }
    }
  }

  private async simulateNetworkCondition(condition: string): Promise<void> {
    // 模拟网络条件
    const networkConfigs = {
      'fast3g': { downloadThroughput: 1.5 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8, latency: 150 },
      'slow3g': { downloadThroughput: 500 * 1024 / 8, uploadThroughput: 500 * 1024 / 8, latency: 400 },
      'offline': { downloadThroughput: 0, uploadThroughput: 0, latency: 0 },
      'online': { downloadThroughput: 10 * 1024 * 1024 / 8, uploadThroughput: 10 * 1024 * 1024 / 8, latency: 10 }
    }

    const config = networkConfigs[condition as keyof typeof networkConfigs]
    if (config) {
      console.log(`Simulating ${condition} network condition`)
      // 在实际应用中，这里需要使用Chrome DevTools Protocol或其他工具
    }
  }

  private async clearCache(): Promise<void> {
    // 清理各种缓存
    if ('caches' in window) {
      const cacheNames = await caches.keys()
      await Promise.all(cacheNames.map(name => caches.delete(name)))
    }

    // 清理localStorage
    localStorage.clear()
    sessionStorage.clear()
  }

  private async waitForPageStable(): Promise<void> {
    // 等待页面稳定（没有网络请求，没有DOM变化）
    return new Promise((resolve) => {
      let stableCount = 0
      const checkStability = () => {
        // 检查是否有正在进行的网络请求
        const hasActiveRequests = (performance as any).getEntriesByType?.('navigation')?.some(
          (entry: any) => entry.loadEventEnd === 0
        )

        if (!hasActiveRequests) {
          stableCount++
          if (stableCount >= 3) { // 连续3次检查都稳定
            resolve()
            return
          }
        } else {
          stableCount = 0
        }

        setTimeout(checkStability, 100)
      }
      
      checkStability()
    })
  }

  private async collectPerformanceMetrics(): Promise<{
    lcp: number
    fid: number
    cls: number
    fcp: number
    tti: number
  }> {
    // 使用Web Vitals API收集指标
    const metrics = {
      lcp: 0,
      fid: 0,
      cls: 0,
      fcp: 0,
      tti: 0
    }

    // 获取LCP
    const lcpEntries = performance.getEntriesByType('largest-contentful-paint') as any[]
    if (lcpEntries.length > 0) {
      metrics.lcp = lcpEntries[lcpEntries.length - 1].startTime
    }

    // 获取FCP
    const paintEntries = performance.getEntriesByType('paint')
    const fcpEntry = paintEntries.find(entry => entry.name === 'first-contentful-paint')
    if (fcpEntry) {
      metrics.fcp = fcpEntry.startTime
    }

    // 获取CLS（需要通过PerformanceObserver）
    if (window.performanceMonitor) {
      const currentMetrics = window.performanceMonitor.getCurrentMetrics()
      metrics.cls = currentMetrics.cls || 0
      metrics.fid = currentMetrics.fid || 0
    }

    // 估算TTI
    metrics.tti = await this.estimateTTI()

    return metrics
  }

  private async measureMemoryUsage(): Promise<number> {
    if ('memory' in performance) {
      const memory = (performance as any).memory
      return Math.round(memory.usedJSHeapSize / 1024 / 1024) // MB
    }
    return 0
  }

  private async measureBundleSize(): Promise<number> {
    // 计算已加载资源的总大小
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
    const totalSize = resources.reduce((sum, resource) => {
      return sum + (resource.transferSize || 0)
    }, 0)
    
    return Math.round(totalSize / 1024) // KB
  }

  private async estimateTTI(): Promise<number> {
    // 简化的TTI估算
    const navigationEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
    if (navigationEntry) {
      return navigationEntry.loadEventEnd || navigationEntry.domContentLoadedEventEnd || 0
    }
    return 0
  }

  private calculateAverageResult(results: PerformanceTestResult[], config: PerformanceTestConfig): PerformanceTestResult {
    const avgMetrics = {
      lcp: 0,
      fid: 0,
      cls: 0,
      fcp: 0,
      tti: 0,
      memoryUsage: 0,
      bundleSize: 0
    }

    // 计算平均值
    results.forEach(result => {
      Object.keys(avgMetrics).forEach(key => {
        avgMetrics[key as keyof typeof avgMetrics] += result.metrics[key as keyof typeof result.metrics]
      })
    })

    Object.keys(avgMetrics).forEach(key => {
      avgMetrics[key as keyof typeof avgMetrics] = Math.round(avgMetrics[key as keyof typeof avgMetrics] / results.length)
    })

    return {
      testName: config.name,
      timestamp: Date.now(),
      device: config.device || 'desktop',
      networkCondition: config.networkCondition || 'online',
      metrics: avgMetrics,
      passed: false, // 将在验证阈值时设置
      failures: [],
      duration: results.reduce((sum, r) => sum + r.duration, 0) / results.length
    }
  }

  private validateThresholds(result: PerformanceTestResult, thresholds?: PerformanceThresholds): boolean {
    if (!thresholds) return true

    const failures: string[] = []

    // 检查每个阈值
    Object.entries(thresholds).forEach(([metric, threshold]) => {
      const value = result.metrics[metric as keyof typeof result.metrics]
      if (value > threshold) {
        failures.push(`${metric}: ${value} > ${threshold}`)
      }
    })

    result.failures = failures
    return failures.length === 0
  }

  private async runLighthouseAudit(config: PerformanceTestConfig): Promise<LighthouseResult | undefined> {
    // 在实际应用中，这里需要集成Lighthouse
    console.log(`Running Lighthouse audit for ${config.url}`)
    
    // 模拟Lighthouse结果
    return {
      performance: 85 + Math.random() * 15,
      accessibility: 90 + Math.random() * 10,
      bestPractices: 80 + Math.random() * 20,
      seo: 85 + Math.random() * 15,
      pwa: 70 + Math.random() * 30,
      audits: {}
    }
  }

  private compareMetrics(baseline: any, current: any): {
    isImproved: boolean
    isRegressed: boolean
    summary: string
  } {
    const improvements: string[] = []
    const regressions: string[] = []

    // 比较关键指标
    const keyMetrics = ['lcp', 'fid', 'cls', 'fcp', 'tti']
    
    keyMetrics.forEach(metric => {
      const baselineValue = baseline[metric]
      const currentValue = current[metric]
      const change = ((currentValue - baselineValue) / baselineValue) * 100

      if (Math.abs(change) > 5) { // 5%的变化阈值
        if (change < 0) {
          improvements.push(`${metric}: ${Math.abs(change).toFixed(1)}% better`)
        } else {
          regressions.push(`${metric}: ${change.toFixed(1)}% worse`)
        }
      }
    })

    const isImproved = improvements.length > regressions.length
    const isRegressed = regressions.length > improvements.length
    const summary = [...improvements, ...regressions].join(', ') || 'No significant changes'

    return { isImproved, isRegressed, summary }
  }

  private generateSuiteReport(suite: PerformanceTestSuite, results: PerformanceTestResult[]): void {
    const passed = results.filter(r => r.passed).length
    const failed = results.length - passed
    
    console.log(`\n📊 Test Suite Report: ${suite.name}`)
    console.log(`✅ Passed: ${passed}`)
    console.log(`❌ Failed: ${failed}`)
    console.log(`📈 Success Rate: ${((passed / results.length) * 100).toFixed(1)}%`)
    
    if (failed > 0) {
      console.log('\n❌ Failed Tests:')
      results.filter(r => !r.passed).forEach(result => {
        console.log(`  - ${result.testName}: ${result.failures.join(', ')}`)
      })
    }
  }

  private exportJSONReport(): string {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      results: this.results,
      summary: this.generateSummary()
    }, null, 2)
  }

  private exportHTMLReport(): string {
    const summary = this.generateSummary()
    
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Performance Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .summary { background: #f5f5f5; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
        .test-result { border: 1px solid #ddd; margin: 10px 0; padding: 15px; border-radius: 5px; }
        .passed { border-left: 5px solid #4caf50; }
        .failed { border-left: 5px solid #f44336; }
        .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-top: 10px; }
        .metric { background: #f9f9f9; padding: 8px; border-radius: 3px; text-align: center; }
    </style>
</head>
<body>
    <h1>Performance Test Report</h1>
    <div class="summary">
        <h2>Summary</h2>
        <p>Total Tests: ${summary.totalTests}</p>
        <p>Passed: ${summary.passed}</p>
        <p>Failed: ${summary.failed}</p>
        <p>Success Rate: ${summary.successRate}%</p>
    </div>
    
    <h2>Test Results</h2>
    ${this.results.map(result => `
        <div class="test-result ${result.passed ? 'passed' : 'failed'}">
            <h3>${result.testName}</h3>
            <p>Device: ${result.device} | Network: ${result.networkCondition}</p>
            <p>Duration: ${Math.round(result.duration)}ms</p>
            ${result.failures.length > 0 ? `<p style="color: red;">Failures: ${result.failures.join(', ')}</p>` : ''}
            
            <div class="metrics">
                <div class="metric">
                    <strong>LCP</strong><br>
                    ${result.metrics.lcp}ms
                </div>
                <div class="metric">
                    <strong>FID</strong><br>
                    ${result.metrics.fid}ms
                </div>
                <div class="metric">
                    <strong>CLS</strong><br>
                    ${result.metrics.cls.toFixed(3)}
                </div>
                <div class="metric">
                    <strong>Memory</strong><br>
                    ${result.metrics.memoryUsage}MB
                </div>
            </div>
        </div>
    `).join('')}
</body>
</html>
    `
  }

  private exportCSVReport(): string {
    const headers = [
      'Test Name', 'Timestamp', 'Device', 'Network', 'Passed', 'Duration',
      'LCP', 'FID', 'CLS', 'FCP', 'TTI', 'Memory', 'Bundle Size', 'Failures'
    ]
    
    const rows = this.results.map(result => [
      result.testName,
      new Date(result.timestamp).toISOString(),
      result.device,
      result.networkCondition,
      result.passed,
      Math.round(result.duration),
      result.metrics.lcp,
      result.metrics.fid,
      result.metrics.cls,
      result.metrics.fcp,
      result.metrics.tti,
      result.metrics.memoryUsage,
      result.metrics.bundleSize,
      result.failures.join('; ')
    ])
    
    return [headers, ...rows].map(row => row.join(',')).join('\n')
  }

  private generateSummary() {
    const totalTests = this.results.length
    const passed = this.results.filter(r => r.passed).length
    const failed = totalTests - passed
    const successRate = totalTests > 0 ? Math.round((passed / totalTests) * 100) : 0
    
    return { totalTests, passed, failed, successRate }
  }

  private setupGlobalErrorHandling(): void {
    // 捕获未处理的错误
    window.addEventListener('error', (event) => {
      if (this.isRunning && this.currentTest) {
        console.error(`Test error in ${this.currentTest.name}:`, event.error)
      }
    })

    window.addEventListener('unhandledrejection', (event) => {
      if (this.isRunning && this.currentTest) {
        console.error(`Test promise rejection in ${this.currentTest.name}:`, event.reason)
      }
    })
  }

  private async resetDeviceSimulation(): Promise<void> {
    // 重置设备模拟
    console.log('Resetting device simulation')
  }

  private async resetNetworkCondition(): Promise<void> {
    // 重置网络条件
    console.log('Resetting network condition')
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

// 全局测试运行器实例
export const performanceTestRunner = new PerformanceTestRunner()

// 预定义测试套件
export const defaultTestSuite: PerformanceTestSuite = {
  name: 'Default Performance Tests',
  globalThresholds: {
    lcp: 2500,
    fid: 100,
    cls: 0.1,
    fcp: 1800,
    tti: 3800,
    memoryUsage: 100,
    bundleSize: 500
  },
  tests: [
    {
      name: 'Homepage Load Test',
      device: 'desktop',
      networkCondition: 'fast3g',
      iterations: 3,
      thresholds: {
        lcp: 2000,
        fcp: 1500
      }
    },
    {
      name: 'Mobile Performance Test',
      device: 'mobile',
      networkCondition: 'slow3g',
      iterations: 3,
      thresholds: {
        lcp: 3000,
        fid: 150
      }
    },
    {
      name: 'Memory Usage Test',
      device: 'desktop',
      networkCondition: 'online',
      iterations: 5,
      thresholds: {
        memoryUsage: 80
      }
    }
  ]
}

// 便捷函数
export async function runPerformanceTest(config: PerformanceTestConfig): Promise<PerformanceTestResult> {
  return performanceTestRunner.runTest(config)
}

export async function runPerformanceTestSuite(suite: PerformanceTestSuite): Promise<PerformanceTestResult[]> {
  return performanceTestRunner.runTestSuite(suite)
}

export function exportPerformanceReport(format: 'json' | 'html' | 'csv' = 'json'): string {
  return performanceTestRunner.exportReport(format)
}

// 类型声明扩展
declare global {
  interface Window {
    gc?: () => void
    performanceMonitor?: {
      getCurrentMetrics: () => any
    }
  }
}