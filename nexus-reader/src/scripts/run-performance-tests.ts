#!/usr/bin/env node
/**
 * Performance Test Runner Script
 * 运行自定义性能测试套件
 */

import { performanceTestRunner, defaultTestSuite, type PerformanceTestSuite } from '../utils/performanceTesting'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

// 扩展的测试套件
const comprehensiveTestSuite: PerformanceTestSuite = {
  name: 'Comprehensive Performance Tests',
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
    // 首页性能测试
    {
      name: 'Homepage Desktop Performance',
      url: 'http://localhost:3000',
      device: 'desktop',
      networkCondition: 'fast3g',
      iterations: 3,
      timeout: 30000,
      thresholds: {
        lcp: 2000,
        fcp: 1500,
        tti: 3000
      }
    },
    
    // 移动端性能测试
    {
      name: 'Homepage Mobile Performance',
      url: 'http://localhost:3000',
      device: 'mobile',
      networkCondition: 'slow3g',
      iterations: 3,
      timeout: 45000,
      thresholds: {
        lcp: 3000,
        fid: 150,
        cls: 0.15
      }
    },
    
    // 阅读器性能测试
    {
      name: 'Reader Page Performance',
      url: 'http://localhost:3000/reader',
      device: 'desktop',
      networkCondition: 'fast3g',
      iterations: 3,
      thresholds: {
        lcp: 2200,
        memoryUsage: 80
      }
    },
    
    // 图书馆页面性能测试
    {
      name: 'Library Page Performance',
      url: 'http://localhost:3000/library',
      device: 'desktop',
      networkCondition: 'online',
      iterations: 2,
      thresholds: {
        lcp: 1800,
        fcp: 1200
      }
    },
    
    // 内存压力测试
    {
      name: 'Memory Stress Test',
      device: 'desktop',
      networkCondition: 'online',
      iterations: 5,
      timeout: 60000,
      thresholds: {
        memoryUsage: 120 // 允许更高的内存使用
      }
    },
    
    // 包大小测试
    {
      name: 'Bundle Size Test',
      device: 'desktop',
      networkCondition: 'online',
      iterations: 1,
      thresholds: {
        bundleSize: 400 // 严格的包大小限制
      }
    },
    
    // 离线性能测试
    {
      name: 'Offline Performance Test',
      device: 'mobile',
      networkCondition: 'offline',
      iterations: 2,
      timeout: 20000,
      thresholds: {
        lcp: 1000, // 离线应该更快
        fcp: 800
      }
    }
  ],
  
  beforeAll: async () => {
    console.log('🚀 Starting comprehensive performance test suite...')
    console.log('📊 Warming up application...')
    
    // 预热应用
    try {
      const response = await fetch('http://localhost:3000')
      if (!response.ok) {
        throw new Error(`Server not ready: ${response.status}`)
      }
      console.log('✅ Application is ready')
    } catch (error) {
      console.error('❌ Application not accessible:', error)
      throw error
    }
  },
  
  afterAll: async () => {
    console.log('🏁 Performance test suite completed')
  },
  
  beforeEach: async () => {
    // 清理缓存和内存
    if (typeof window !== 'undefined') {
      if ('caches' in window) {
        const cacheNames = await caches.keys()
        await Promise.all(cacheNames.map(name => caches.delete(name)))
      }
      
      if (window.gc) {
        window.gc()
      }
    }
  }
}

async function main() {
  try {
    console.log('🧪 Running Performance Tests')
    console.log('=' .repeat(50))
    
    // 创建报告目录
    const reportsDir = join(process.cwd(), 'performance-reports')
    mkdirSync(reportsDir, { recursive: true })
    
    // 运行测试套件
    const results = await performanceTestRunner.runTestSuite(comprehensiveTestSuite)
    
    // 生成详细报告
    const timestamp = new Date().toISOString()
    const reportData = {
      timestamp,
      suite: comprehensiveTestSuite.name,
      results,
      summary: {
        totalTests: results.length,
        passed: results.filter(r => r.passed).length,
        failed: results.filter(r => !r.passed).length,
        successRate: Math.round((results.filter(r => r.passed).length / results.length) * 100)
      },
      averageMetrics: calculateAverageMetrics(results),
      regressions: identifyRegressions(results),
      recommendations: generateRecommendations(results)
    }
    
    // 保存JSON报告
    const jsonReportPath = join(reportsDir, `performance-test-${Date.now()}.json`)
    writeFileSync(jsonReportPath, JSON.stringify(reportData, null, 2))
    
    // 保存摘要报告
    const summaryPath = join(reportsDir, 'summary.json')
    writeFileSync(summaryPath, JSON.stringify({
      timestamp,
      lcp: reportData.averageMetrics.lcp,
      fid: reportData.averageMetrics.fid,
      cls: reportData.averageMetrics.cls,
      fcp: reportData.averageMetrics.fcp,
      tti: reportData.averageMetrics.tti,
      memoryUsage: reportData.averageMetrics.memoryUsage,
      bundleSize: reportData.averageMetrics.bundleSize,
      successRate: reportData.summary.successRate,
      regressions: reportData.regressions,
      recommendations: reportData.recommendations
    }, null, 2))
    
    // 保存HTML报告
    const htmlReport = performanceTestRunner.exportReport('html')
    const htmlReportPath = join(reportsDir, `performance-report-${Date.now()}.html`)
    writeFileSync(htmlReportPath, htmlReport)
    
    console.log('\n📊 Test Results Summary:')
    console.log(`✅ Passed: ${reportData.summary.passed}`)
    console.log(`❌ Failed: ${reportData.summary.failed}`)
    console.log(`📈 Success Rate: ${reportData.summary.successRate}%`)
    
    if (reportData.summary.failed > 0) {
      console.log('\n❌ Failed Tests:')
      results.filter(r => !r.passed).forEach(result => {
        console.log(`  - ${result.testName}: ${result.failures.join(', ')}`)
      })
    }
    
    if (reportData.regressions.length > 0) {
      console.log('\n⚠️ Performance Regressions:')
      reportData.regressions.forEach(regression => {
        console.log(`  - ${regression}`)
      })
    }
    
    console.log(`\n📄 Reports saved to: ${reportsDir}`)
    
    // 如果有失败的测试，退出码为1
    if (reportData.summary.failed > 0) {
      process.exit(1)
    }
    
  } catch (error) {
    console.error('❌ Performance test runner failed:', error)
    process.exit(1)
  }
}

function calculateAverageMetrics(results: any[]) {
  const validResults = results.filter(r => r.passed)
  if (validResults.length === 0) return {}
  
  const metrics = ['lcp', 'fid', 'cls', 'fcp', 'tti', 'memoryUsage', 'bundleSize']
  const averages: any = {}
  
  metrics.forEach(metric => {
    const values = validResults.map(r => r.metrics[metric]).filter(v => v > 0)
    if (values.length > 0) {
      averages[metric] = Math.round(values.reduce((sum, v) => sum + v, 0) / values.length)
    }
  })
  
  return averages
}

function identifyRegressions(results: any[]): string[] {
  const regressions: string[] = []
  
  // 检查是否有测试失败
  results.forEach(result => {
    if (!result.passed) {
      result.failures.forEach((failure: string) => {
        regressions.push(`${result.testName}: ${failure}`)
      })
    }
  })
  
  return regressions
}

function generateRecommendations(results: any[]): string[] {
  const recommendations: string[] = []
  const averages = calculateAverageMetrics(results)
  
  // 基于平均指标生成建议
  if (averages.lcp > 2500) {
    recommendations.push('优化LCP: 考虑优化关键资源加载和服务器响应时间')
  }
  
  if (averages.fid > 100) {
    recommendations.push('优化FID: 减少主线程阻塞时间，优化JavaScript执行')
  }
  
  if (averages.cls > 0.1) {
    recommendations.push('优化CLS: 为图片和广告预留空间，避免动态内容插入')
  }
  
  if (averages.memoryUsage > 100) {
    recommendations.push('优化内存使用: 检查内存泄漏，优化大对象的使用')
  }
  
  if (averages.bundleSize > 500) {
    recommendations.push('优化包大小: 启用代码分割，移除未使用的依赖')
  }
  
  return recommendations
}

// 运行主函数
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}