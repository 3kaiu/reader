#!/usr/bin/env node

/**
 * Integration Test Runner
 *
 * Comprehensive test runner for integration tests with performance monitoring,
 * load testing, and detailed reporting.
 */

import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Configuration
const CONFIG = {
  testTimeout: 300000, // 5 minutes total timeout
  maxRetries: 2,
  reportDir: './test-results',
  coverageDir: './coverage/integration',
  logLevel: process.env.LOG_LEVEL || 'info',
}

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
}

function log(level, message, ...args) {
  const timestamp = new Date().toISOString()
  const levelColors = {
    info: colors.blue,
    success: colors.green,
    warning: colors.yellow,
    error: colors.red,
    debug: colors.magenta,
  }

  const color = levelColors[level] || colors.reset
  console.log(`${color}[${timestamp}] ${level.toUpperCase()}: ${message}${colors.reset}`, ...args)
}

function createDirectories() {
  const dirs = [CONFIG.reportDir, CONFIG.coverageDir, './logs']

  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
      log('info', `Created directory: ${dir}`)
    }
  })
}

function runCommand(command, options = {}) {
  return new Promise((resolve, reject) => {
    log('info', `Running: ${command}`)

    const child = spawn('sh', ['-c', command], {
      stdio: 'pipe',
      ...options,
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', data => {
      stdout += data.toString()
      if (CONFIG.logLevel === 'debug') {
        process.stdout.write(data)
      }
    })

    child.stderr.on('data', data => {
      stderr += data.toString()
      if (CONFIG.logLevel === 'debug') {
        process.stderr.write(data)
      }
    })

    child.on('close', code => {
      if (code === 0) {
        resolve({ stdout, stderr, code })
      } else {
        reject(new Error(`Command failed with code ${code}\nSTDOUT: ${stdout}\nSTDERR: ${stderr}`))
      }
    })

    // Set timeout
    setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`Command timed out after ${CONFIG.testTimeout}ms`))
    }, CONFIG.testTimeout)
  })
}

async function runIntegrationTests() {
  log('info', 'Starting integration test suite...')

  try {
    // Create necessary directories
    createDirectories()

    // Run integration tests with Vitest
    const testCommand = [
      'bunx vitest run',
      '--config vitest.integration.config.ts',
      '--reporter=verbose',
      '--reporter=json',
      '--reporter=html',
      '--coverage',
      '--no-watch',
    ].join(' ')

    const result = await runCommand(testCommand)

    log('success', 'Integration tests completed successfully')

    // Parse and display results
    await parseAndDisplayResults()

    return { success: true, output: result.stdout }
  } catch (error) {
    log('error', 'Integration tests failed:', error.message)

    // Try to parse partial results
    try {
      await parseAndDisplayResults()
    } catch (parseError) {
      log('warning', 'Could not parse test results:', parseError.message)
    }

    return { success: false, error: error.message }
  }
}

async function parseAndDisplayResults() {
  const resultsFile = path.join(CONFIG.reportDir, 'integration-results.json')

  if (!fs.existsSync(resultsFile)) {
    log('warning', 'No results file found, generating summary from logs...')
    return
  }

  try {
    const results = JSON.parse(fs.readFileSync(resultsFile, 'utf8'))

    log('info', '📊 Integration Test Results Summary:')
    console.log(`${colors.bright}=== TEST SUMMARY ===${colors.reset}`)
    console.log(`Total Tests: ${results.numTotalTests || 0}`)
    console.log(`${colors.green}Passed: ${results.numPassedTests || 0}${colors.reset}`)
    console.log(`${colors.red}Failed: ${results.numFailedTests || 0}${colors.reset}`)
    console.log(`${colors.yellow}Skipped: ${results.numPendingTests || 0}${colors.reset}`)
    console.log(
      `Duration: ${((results.testResults?.[0]?.perfStats?.end - results.testResults?.[0]?.perfStats?.start) / 1000).toFixed(2)}s`
    )

    if (results.coverageMap) {
      console.log(`\n${colors.bright}=== COVERAGE SUMMARY ===${colors.reset}`)
      // Coverage details would be parsed here
      console.log('Coverage report generated in:', CONFIG.coverageDir)
    }

    if (results.numFailedTests > 0) {
      console.log(`\n${colors.bright}=== FAILED TESTS ===${colors.reset}`)
      results.testResults?.forEach(suite => {
        suite.assertionResults?.forEach(test => {
          if (test.status === 'failed') {
            console.log(`${colors.red}❌ ${test.fullName}${colors.reset}`)
            if (test.failureMessages?.length > 0) {
              console.log(`   ${test.failureMessages[0].split('\n')[0]}`)
            }
          }
        })
      })
    }

    // Performance metrics
    console.log(`\n${colors.bright}=== PERFORMANCE METRICS ===${colors.reset}`)
    console.log('Detailed performance report available in test results')
  } catch (error) {
    log('error', 'Failed to parse test results:', error.message)
  }
}

async function runPerformanceBenchmarks() {
  log('info', 'Running performance benchmarks...')

  try {
    const benchCommand = [
      'bunx vitest bench',
      '--config vitest.integration.config.ts',
      '--reporter=verbose',
    ].join(' ')

    const result = await runCommand(benchCommand)

    log('success', 'Performance benchmarks completed')
    return { success: true, output: result.stdout }
  } catch (error) {
    log('error', 'Performance benchmarks failed:', error.message)
    return { success: false, error: error.message }
  }
}

async function generateReport() {
  log('info', 'Generating comprehensive test report...')

  const reportData = {
    timestamp: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      memory: process.memoryUsage(),
    },
    configuration: CONFIG,
    testResults: {},
    performanceMetrics: {},
    recommendations: [],
  }

  // Add test results if available
  const resultsFile = path.join(CONFIG.reportDir, 'integration-results.json')
  if (fs.existsSync(resultsFile)) {
    try {
      reportData.testResults = JSON.parse(fs.readFileSync(resultsFile, 'utf8'))
    } catch (error) {
      log('warning', 'Could not include test results in report:', error.message)
    }
  }

  // Generate recommendations based on results
  if (reportData.testResults.numFailedTests > 0) {
    reportData.recommendations.push('Review failed tests and fix underlying issues')
  }

  if (reportData.testResults.numTotalTests < 10) {
    reportData.recommendations.push('Consider adding more integration tests for better coverage')
  }

  reportData.recommendations.push('Monitor performance metrics regularly')
  reportData.recommendations.push('Update test data and scenarios based on production usage')

  // Write comprehensive report
  const reportFile = path.join(CONFIG.reportDir, 'integration-test-report.json')
  fs.writeFileSync(reportFile, JSON.stringify(reportData, null, 2))

  log('success', `Comprehensive report generated: ${reportFile}`)
}

// Main execution
async function main() {
  const startTime = Date.now()

  log(
    'info',
    `${colors.bright}🚀 Starting Free Tier Maximization Integration Test Suite${colors.reset}`
  )

  try {
    // Run integration tests
    const testResults = await runIntegrationTests()

    // Run performance benchmarks
    const benchResults = await runPerformanceBenchmarks()

    // Generate comprehensive report
    await generateReport()

    const duration = ((Date.now() - startTime) / 1000).toFixed(2)

    if (testResults.success && benchResults.success) {
      log('success', `✅ All tests completed successfully in ${duration}s`)
      process.exit(0)
    } else {
      log('error', `❌ Some tests failed. Duration: ${duration}s`)
      process.exit(1)
    }
  } catch (error) {
    log('error', '💥 Test suite execution failed:', error.message)
    process.exit(1)
  }
}

// Handle process signals
process.on('SIGINT', () => {
  log('warning', 'Received SIGINT, cleaning up...')
  process.exit(130)
})

process.on('SIGTERM', () => {
  log('warning', 'Received SIGTERM, cleaning up...')
  process.exit(143)
})

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    log('error', 'Unhandled error:', error)
    process.exit(1)
  })
}

export { runIntegrationTests, runPerformanceBenchmarks, generateReport }
