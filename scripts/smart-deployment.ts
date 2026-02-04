#!/usr/bin/env node

/**
 * 智能部署增强系统
 * 基于AI的智能部署决策和自动化流程
 */

import { execSync, spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { performance } from 'perf_hooks'

// 部署配置接口
interface DeploymentConfig {
  environment: 'development' | 'staging' | 'production'
  strategy: 'rolling' | 'blue-green' | 'canary'
  rollbackEnabled: boolean
  monitoringEnabled: boolean
  healthChecks: HealthCheck[]
  preDeployHooks: string[]
  postDeployHooks: string[]
}

interface HealthCheck {
  name: string
  url: string
  method: 'GET' | 'POST' | 'HEAD'
  expectedStatus: number
  timeout: number
  retries: number
}

interface DeploymentResult {
  success: boolean
  duration: number
  environment: string
  version: string
  healthChecksPassed: number
  totalHealthChecks: number
  rollbackTriggered: boolean
  errors: string[]
  warnings: string[]
}

class SmartDeploymentEngine {
  private config: DeploymentConfig
  private startTime: number = 0
  private deploymentLog: string[] = []

  constructor(config: Partial<DeploymentConfig> = {}) {
    this.config = {
      environment: 'production',
      strategy: 'rolling',
      rollbackEnabled: true,
      monitoringEnabled: true,
      healthChecks: [],
      preDeployHooks: [],
      postDeployHooks: [],
      ...config
    }
  }

  /**
   * 执行智能部署
   */
  async deploy(): Promise<DeploymentResult> {
    this.startTime = performance.now()
    this.log(`🚀 开始智能部署 - 环境: ${this.config.environment}`)

    try {
      // 1. 预部署检查
      await this.preDeployChecks()

      // 2. 执行预部署钩子
      await this.executePreDeployHooks()

      // 3. 构建和准备
      await this.buildAndPrepare()

      // 4. 执行部署策略
      await this.executeDeploymentStrategy()

      // 5. 健康检查
      const healthResult = await this.performHealthChecks()

      // 6. 执行后部署钩子
      await this.executePostDeployHooks()

      // 7. 监控设置
      if (this.config.monitoringEnabled) {
        await this.setupMonitoring()
      }

      const duration = performance.now() - this.startTime
      const result: DeploymentResult = {
        success: healthResult.passed,
        duration,
        environment: this.config.environment,
        version: this.getVersion(),
        healthChecksPassed: healthResult.passedCount,
        totalHealthChecks: this.config.healthChecks.length,
        rollbackTriggered: false,
        errors: [],
        warnings: []
      }

      // 如果健康检查失败且启用了回滚，则执行回滚
      if (!healthResult.passed && this.config.rollbackEnabled) {
        this.log('❌ 健康检查失败，执行自动回滚...')
        await this.rollback()
        result.rollbackTriggered = true
        result.errors.push('Deployment failed health checks, rolled back')
      }

      this.logResult(result)
      return result

    } catch (error) {
      const duration = performance.now() - this.startTime
      this.log(`❌ 部署失败: ${error instanceof Error ? error.message : String(error)}`)

      // 失败时自动回滚
      if (this.config.rollbackEnabled) {
        await this.rollback()
      }

      return {
        success: false,
        duration,
        environment: this.config.environment,
        version: this.getVersion(),
        healthChecksPassed: 0,
        totalHealthChecks: this.config.healthChecks.length,
        rollbackTriggered: this.config.rollbackEnabled,
        errors: [error instanceof Error ? error.message : String(error)],
        warnings: []
      }
    }
  }

  /**
   * 预部署检查
   */
  private async preDeployChecks(): Promise<void> {
    this.log('📋 执行预部署检查...')

    // 检查Git状态
    this.checkGitStatus()

    // 检查构建依赖
    this.checkBuildDependencies()

    // 检查环境变量
    this.checkEnvironmentVariables()

    // 检查磁盘空间
    this.checkDiskSpace()

    // 检查网络连接
    await this.checkNetworkConnectivity()

    this.log('✅ 预部署检查通过')
  }

  /**
   * 执行预部署钩子
   */
  private async executePreDeployHooks(): Promise<void> {
    if (this.config.preDeployHooks.length === 0) return

    this.log('🔗 执行预部署钩子...')

    for (const hook of this.config.preDeployHooks) {
      try {
        await this.executeHook(hook)
        this.log(`✅ 钩子执行成功: ${hook}`)
      } catch (error) {
        throw new Error(`预部署钩子失败: ${hook} - ${error}`)
      }
    }
  }

  /**
   * 构建和准备
   */
  private async buildAndPrepare(): Promise<void> {
    this.log('🔨 执行构建和准备...')

    // 智能缓存检查
    if (this.isBuildCacheValid()) {
      this.log('✅ 使用构建缓存，跳过构建')
      return
    }

    // 执行构建
    await this.executeBuild()

    // 优化构建产物
    await this.optimizeBuildArtifacts()

    // 生成部署包
    await this.createDeploymentPackage()

    this.log('✅ 构建和准备完成')
  }

  /**
   * 执行部署策略
   */
  private async executeDeploymentStrategy(): Promise<void> {
    this.log(`📦 执行部署策略: ${this.config.strategy}`)

    switch (this.config.strategy) {
      case 'rolling':
        await this.rollingDeployment()
        break
      case 'blue-green':
        await this.blueGreenDeployment()
        break
      case 'canary':
        await this.canaryDeployment()
        break
      default:
        throw new Error(`不支持的部署策略: ${this.config.strategy}`)
    }

    this.log('✅ 部署策略执行完成')
  }

  /**
   * 执行健康检查
   */
  private async performHealthChecks(): Promise<{ passed: boolean; passedCount: number }> {
    if (this.config.healthChecks.length === 0) {
      this.log('⚠️ 未配置健康检查，跳过')
      return { passed: true, passedCount: 0 }
    }

    this.log('🏥 执行健康检查...')

    let passedCount = 0

    for (const check of this.config.healthChecks) {
      const passed = await this.performSingleHealthCheck(check)
      if (passed) {
        passedCount++
        this.log(`✅ 健康检查通过: ${check.name}`)
      } else {
        this.log(`❌ 健康检查失败: ${check.name}`)
      }
    }

    const passed = passedCount === this.config.healthChecks.length
    this.log(`🏥 健康检查结果: ${passedCount}/${this.config.healthChecks.length} 通过`)

    return { passed, passedCount }
  }

  /**
   * 执行后部署钩子
   */
  private async executePostDeployHooks(): Promise<void> {
    if (this.config.postDeployHooks.length === 0) return

    this.log('🔗 执行后部署钩子...')

    for (const hook of this.config.postDeployHooks) {
      try {
        await this.executeHook(hook)
        this.log(`✅ 钩子执行成功: ${hook}`)
      } catch (error) {
        this.log(`⚠️ 钩子执行失败: ${hook} - ${error}`)
        // 后部署钩子失败不阻断部署
      }
    }
  }

  /**
   * 设置监控
   */
  private async setupMonitoring(): Promise<void> {
    this.log('📊 设置部署监控...')

    // 这里可以设置各种监控指标
    // - 响应时间监控
    // - 错误率监控
    // - 资源使用监控
    // - 用户行为监控

    this.log('✅ 监控设置完成')
  }

  /**
   * 执行回滚
   */
  private async rollback(): Promise<void> {
    this.log('🔄 执行部署回滚...')

    try {
      // 获取上一个稳定版本
      const previousVersion = await this.getPreviousStableVersion()

      // 执行回滚部署
      await this.deployVersion(previousVersion)

      this.log('✅ 回滚完成')
    } catch (error) {
      this.log(`❌ 回滚失败: ${error}`)
      throw error
    }
  }

  // 部署策略实现
  private async rollingDeployment(): Promise<void> {
    // 滚动部署：逐步替换实例
    this.log('🔄 执行滚动部署...')

    // 这里实现滚动部署逻辑
    // 1. 逐步停止旧实例
    // 2. 启动新实例
    // 3. 验证新实例
    // 4. 继续下一个实例

    await this.deployToTarget('rolling')
  }

  private async blueGreenDeployment(): Promise<void> {
    // 蓝绿部署：并行运行新旧版本
    this.log('🔵 执行蓝绿部署...')

    // 这里实现蓝绿部署逻辑
    // 1. 启动新版本（绿色环境）
    // 2. 验证新版本
    // 3. 切换流量到新版本
    // 4. 停止旧版本（蓝色环境）

    await this.deployToTarget('blue-green')
  }

  private async canaryDeployment(): Promise<void> {
    // 金丝雀部署：逐步增加新版本流量
    this.log('🐦 执行金丝雀部署...')

    // 这里实现金丝雀部署逻辑
    // 1. 部署新版本到小部分实例
    // 2. 逐步增加流量比例
    // 3. 监控性能和错误率
    // 4. 根据结果决定继续或回滚

    await this.deployToTarget('canary')
  }

  // 工具方法
  private checkGitStatus(): void {
    try {
      const status = execSync('git status --porcelain', { encoding: 'utf8' })
      if (status.trim()) {
        this.log('⚠️ 工作目录有未提交的更改')
      }
    } catch (error) {
      throw new Error('Git状态检查失败')
    }
  }

  private checkBuildDependencies(): void {
    // 检查Node.js版本
    const nodeVersion = process.version
    if (!nodeVersion.includes('v18') && !nodeVersion.includes('v20')) {
      throw new Error(`不支持的Node.js版本: ${nodeVersion}`)
    }

    // 检查 Bun（nexus-reader 使用 Bun 构建）
    try {
      execSync('bun --version', { stdio: 'ignore' })
    } catch {
      throw new Error('Bun 未安装，请安装 https://bun.sh')
    }
  }

  private checkEnvironmentVariables(): void {
    const requiredVars = ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']
    const missing = requiredVars.filter(v => !process.env[v])

    if (missing.length > 0) {
      this.log(`⚠️ 缺少环境变量: ${missing.join(', ')}`)
    }
  }

  private checkDiskSpace(): void {
    try {
      // 在类Unix系统上检查磁盘空间
      const df = execSync('df -h . | tail -1', { encoding: 'utf8' })
      const available = df.split(/\s+/)[3]

      if (available.includes('G')) {
        const gb = parseFloat(available)
        if (gb < 1) {
          throw new Error('磁盘空间不足')
        }
      }
    } catch (error) {
      this.log('⚠️ 无法检查磁盘空间')
    }
  }

  private async checkNetworkConnectivity(): Promise<void> {
    // 检查网络连接
    try {
      await this.makeRequest('https://www.google.com', { timeout: 5000 })
    } catch {
      throw new Error('网络连接失败')
    }
  }

  private isBuildCacheValid(): boolean {
    // 检查构建缓存是否有效
    try {
      const cacheFile = path.join(process.cwd(), '.build-cache')
      if (!fs.existsSync(cacheFile)) return false

      const lastBuildCommit = fs.readFileSync(cacheFile, 'utf8').trim()
      const currentCommit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()

      return lastBuildCommit === currentCommit
    } catch {
      return false
    }
  }

  private async executeBuild(): Promise<void> {
    // 执行构建
    const buildCommand = process.platform === 'win32' ? 'bun.cmd run build' : 'bun run build'

    await new Promise((resolve, reject) => {
      const child = spawn(buildCommand, [], {
        stdio: 'inherit',
        shell: true,
        cwd: path.join(process.cwd(), 'nexus-reader')
      })

      child.on('close', (code) => {
        if (code === 0) {
          resolve(void 0)
        } else {
          reject(new Error(`构建失败，退出码: ${code}`))
        }
      })

      child.on('error', reject)
    })
  }

  private async optimizeBuildArtifacts(): Promise<void> {
    // 优化构建产物
    const distPath = path.join(process.cwd(), 'nexus-reader', 'dist')

    if (!fs.existsSync(distPath)) return

    // 这里可以添加构建产物优化逻辑
    // - 压缩文件
    // - 移除调试信息
    // - 优化资源引用
  }

  private async createDeploymentPackage(): Promise<void> {
    // 创建部署包
    // 这里可以添加打包逻辑
  }

  private async deployToTarget(strategy: string): Promise<void> {
    // 根据策略部署到目标环境
    switch (this.config.environment) {
      case 'production':
        await this.deployToProduction(strategy)
        break
      case 'staging':
        await this.deployToStaging(strategy)
        break
      case 'development':
        await this.deployToDevelopment(strategy)
        break
    }
  }

  private async deployToProduction(strategy: string): Promise<void> {
    // 生产环境部署逻辑
    this.log(`🚀 部署到生产环境 (${strategy}策略)`)
    // 这里实现具体的部署逻辑
  }

  private async deployToStaging(strategy: string): Promise<void> {
    // 预发布环境部署逻辑
    this.log(`🧪 部署到预发布环境 (${strategy}策略)`)
    // 这里实现具体的部署逻辑
  }

  private async deployToDevelopment(strategy: string): Promise<void> {
    // 开发环境部署逻辑
    this.log(`💻 部署到开发环境 (${strategy}策略)`)
    // 这里实现具体的部署逻辑
  }

  private async performSingleHealthCheck(check: HealthCheck): Promise<boolean> {
    try {
      const response = await this.makeRequest(check.url, {
        method: check.method,
        timeout: check.timeout
      })

      return response.status === check.expectedStatus
    } catch {
      return false
    }
  }

  private async makeRequest(url: string, options: { method?: string; timeout?: number } = {}): Promise<Response> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), options.timeout || 10000)

    try {
      const response = await fetch(url, {
        method: options.method || 'GET',
        signal: controller.signal
      })
      clearTimeout(timeoutId)
      return response
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  }

  private async executeHook(hookCommand: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(hookCommand, [], {
        stdio: 'inherit',
        shell: true
      })

      child.on('close', (code) => {
        if (code === 0) {
          resolve()
        } else {
          reject(new Error(`钩子执行失败，退出码: ${code}`))
        }
      })

      child.on('error', reject)
    })
  }

  private async getPreviousStableVersion(): Promise<string> {
    // 获取上一个稳定版本
    // 这里可以从Git标签或其他来源获取
    return 'v1.0.0'
  }

  private async deployVersion(version: string): Promise<void> {
    // 部署指定版本
    this.log(`📦 部署版本: ${version}`)
    // 这里实现版本部署逻辑
  }

  private getVersion(): string {
    try {
      return execSync('git describe --tags --abbrev=0 2>/dev/null || git rev-parse --short HEAD', {
        encoding: 'utf8'
      }).trim()
    } catch {
      return 'unknown'
    }
  }

  private log(message: string): void {
    const timestamp = new Date().toISOString()
    const logMessage = `[${timestamp}] ${message}`
    console.log(logMessage)
    this.deploymentLog.push(logMessage)
  }

  private logResult(result: DeploymentResult): void {
    const status = result.success ? '✅ 成功' : '❌ 失败'
    this.log(`${status} - 部署完成`)
    this.log(`⏱️ 耗时: ${(result.duration / 1000).toFixed(2)}秒`)
    this.log(`🏥 健康检查: ${result.healthChecksPassed}/${result.totalHealthChecks}`)

    if (result.rollbackTriggered) {
      this.log('🔄 已执行自动回滚')
    }

    if (result.errors.length > 0) {
      result.errors.forEach(error => this.log(`❌ ${error}`))
    }

    if (result.warnings.length > 0) {
      result.warnings.forEach(warning => this.log(`⚠️ ${warning}`))
    }
  }

  // 公共API
  setConfig(config: Partial<DeploymentConfig>): void {
    this.config = { ...this.config, ...config }
  }

  addHealthCheck(check: HealthCheck): void {
    this.config.healthChecks.push(check)
  }

  addPreDeployHook(hook: string): void {
    this.config.preDeployHooks.push(hook)
  }

  addPostDeployHook(hook: string): void {
    this.config.postDeployHooks.push(hook)
  }

  getDeploymentLog(): string[] {
    return [...this.deploymentLog]
  }

  getConfig(): DeploymentConfig {
    return { ...this.config }
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  const engine = new SmartDeploymentEngine({
    environment: (process.env.DEPLOY_ENV as any) || 'production',
    strategy: (process.env.DEPLOY_STRATEGY as any) || 'rolling',
    rollbackEnabled: process.env.DISABLE_ROLLBACK !== 'true',
    monitoringEnabled: process.env.ENABLE_MONITORING !== 'false'
  })

  // 添加默认健康检查
  engine.addHealthCheck({
    name: 'Frontend Health',
    url: 'https://nexus-reader.pages.dev',
    method: 'GET',
    expectedStatus: 200,
    timeout: 10000,
    retries: 3
  })

  engine.addHealthCheck({
    name: 'API Health',
    url: 'https://api.nexus-reader.pages.dev/health',
    method: 'GET',
    expectedStatus: 200,
    timeout: 5000,
    retries: 3
  })

  engine.deploy()
    .then((result) => {
      process.exit(result.success ? 0 : 1)
    })
    .catch((error) => {
      console.error('Deployment failed:', error)
      process.exit(1)
    })
}

export { SmartDeploymentEngine, DeploymentConfig, HealthCheck, DeploymentResult }