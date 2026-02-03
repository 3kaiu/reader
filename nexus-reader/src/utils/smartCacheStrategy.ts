/**
 * 智能内容缓存策略 - Smart Content Caching Strategy
 * 基于用户行为和内容特征的智能缓存决策
 */

import { ref, reactive, readonly } from 'vue'
import { userAnalytics } from './userAnalytics'
import { recommendationEngine } from './recommendationEngine'
import { logger } from './logger'

// ===== 数据结构 =====

export interface CacheEntry {
  key: string
  content: any
  size: number
  accessCount: number
  lastAccessed: number
  createdAt: number
  expiryTime?: number
  priority: CachePriority
  metadata: CacheMetadata
}

export interface CacheMetadata {
  contentType: ContentType
  userId?: string
  bookId?: string
  chapterId?: string
  popularityScore: number
  accessPattern: AccessPattern
  compressionRatio?: number
  dependencies: string[]
}

export enum ContentType {
  BOOK_CHAPTER = 'book_chapter',
  BOOK_METADATA = 'book_metadata',
  USER_PROFILE = 'user_profile',
  RECOMMENDATIONS = 'recommendations',
  SEARCH_RESULTS = 'search_results',
  ASSETS = 'assets',
  OFFLINE_CONTENT = 'offline_content'
}

export enum CachePriority {
  CRITICAL = 5,    // 必须缓存（如当前阅读章节）
  HIGH = 4,        // 高优先级（如用户常用功能）
  MEDIUM = 3,      // 中等优先级（如推荐内容）
  LOW = 2,         // 低优先级（如历史记录）
  OPTIONAL = 1     // 可选缓存（如预加载内容）
}

export enum AccessPattern {
  FREQUENT = 'frequent',         // 频繁访问
  RECENT = 'recent',            // 最近访问
  PREDICTED = 'predicted',       // 预测访问
  SEQUENTIAL = 'sequential',     // 顺序访问（如连续章节）
  RANDOM = 'random'             // 随机访问
}

export interface CacheStrategy {
  id: string
  name: string
  description: string
  isActive: boolean
  priority: number

  shouldCache(entry: CacheEntry, context: CacheContext): boolean
  calculatePriority(entry: CacheEntry, context: CacheContext): CachePriority
  predictAccessProbability(entry: CacheEntry, context: CacheContext): number
  estimateExpiryTime(entry: CacheEntry, context: CacheContext): number
}

export interface CacheContext {
  userId: string
  currentTime: number
  deviceMemory: number
  networkType: 'wifi' | 'mobile' | 'offline'
  batteryLevel: number
  userBehavior: UserBehaviorContext
  systemLoad: number
}

export interface UserBehaviorContext {
  readingSpeed: number
  sessionDuration: number
  preferredGenres: string[]
  readingSchedule: { hour: number; activity: number }[]
  offlinePreference: boolean
}

// ===== 缓存策略实现 =====

class UserBehaviorBasedStrategy implements CacheStrategy {
  id = 'user_behavior'
  name = '基于用户行为的智能缓存'
  description = '根据用户的阅读习惯和行为模式智能决定缓存内容'
  isActive = true
  priority = 10

  shouldCache(entry: CacheEntry, context: CacheContext): boolean {
    const accessProb = this.predictAccessProbability(entry, context)
    const priority = this.calculatePriority(entry, context)

    // 高概率访问或高优先级的内容必须缓存
    if (accessProb > 0.8 || priority >= CachePriority.HIGH) {
      return true
    }

    // 中等概率的内容在WiFi和电量充足时缓存
    if (accessProb > 0.5 && context.networkType === 'wifi' && context.batteryLevel > 20) {
      return true
    }

    // 低概率内容仅在离线模式下缓存
    if (context.networkType === 'offline' && entry.metadata.contentType === ContentType.BOOK_CHAPTER) {
      return true
    }

    return false
  }

  calculatePriority(entry: CacheEntry, context: CacheContext): CachePriority {
    // 基于内容类型和用户行为的优先级计算
    let basePriority = CachePriority.MEDIUM

    switch (entry.metadata.contentType) {
      case ContentType.BOOK_CHAPTER:
        // 当前阅读章节最高优先级
        if (this.isCurrentReadingChapter(entry, context)) {
          basePriority = CachePriority.CRITICAL
        }
        // 即将阅读的章节高优先级
        else if (this.isUpcomingChapter(entry, context)) {
          basePriority = CachePriority.HIGH
        }
        break

      case ContentType.RECOMMENDATIONS:
        basePriority = CachePriority.MEDIUM
        break

      case ContentType.USER_PROFILE:
        basePriority = CachePriority.HIGH
        break

      case ContentType.SEARCH_RESULTS:
        basePriority = CachePriority.LOW
        break
    }

    // 根据访问模式调整优先级
    switch (entry.metadata.accessPattern) {
      case AccessPattern.FREQUENT:
        basePriority = Math.max(basePriority, CachePriority.HIGH)
        break
      case AccessPattern.PREDICTED:
        if (basePriority < CachePriority.HIGH) {
          basePriority = Math.max(basePriority, CachePriority.MEDIUM)
        }
        break
    }

    return basePriority
  }

  predictAccessProbability(entry: CacheEntry, context: CacheContext): number {
    let probability = 0.1 // 基础概率

    // 基于访问历史的概率
    const timeSinceLastAccess = context.currentTime - entry.lastAccessed
    if (timeSinceLastAccess < 3600000) { // 1小时内
      probability += 0.4
    } else if (timeSinceLastAccess < 86400000) { // 24小时内
      probability += 0.2
    }

    // 基于访问频率的概率
    if (entry.accessCount > 10) {
      probability += 0.3
    } else if (entry.accessCount > 5) {
      probability += 0.2
    } else if (entry.accessCount > 1) {
      probability += 0.1
    }

    // 基于内容类型的概率
    switch (entry.metadata.contentType) {
      case ContentType.BOOK_CHAPTER:
        probability += 0.3
        // 如果是用户喜欢类型的书，进一步增加概率
        if (this.isPreferredGenre(entry, context)) {
          probability += 0.2
        }
        break
      case ContentType.RECOMMENDATIONS:
        probability += 0.2
        break
      case ContentType.USER_PROFILE:
        probability += 0.4
        break
    }

    // 基于预测行为的概率
    if (this.isPredictedAccess(entry, context)) {
      probability += 0.3
    }

    return Math.min(probability, 1.0)
  }

  estimateExpiryTime(entry: CacheEntry, context: CacheContext): number {
    const baseExpiry = context.currentTime + 3600000 // 1小时基础过期时间

    // 基于访问模式的过期时间调整
    switch (entry.metadata.accessPattern) {
      case AccessPattern.FREQUENT:
        return baseExpiry * 4 // 4小时
      case AccessPattern.RECENT:
        return baseExpiry * 2 // 2小时
      case AccessPattern.SEQUENTIAL:
        return baseExpiry * 3 // 3小时（章节连续阅读）
      default:
        return baseExpiry
    }
  }

  private isCurrentReadingChapter(entry: CacheEntry, context: CacheContext): boolean {
    // 检查是否是用户当前正在阅读的章节
    return entry.metadata.userId === context.userId &&
      entry.metadata.contentType === ContentType.BOOK_CHAPTER &&
      entry.lastAccessed > context.currentTime - 300000 // 5分钟内访问过
  }

  private isUpcomingChapter(entry: CacheEntry, context: CacheContext): boolean {
    // 预测用户即将阅读的章节（基于阅读速度和当前进度）
    if (entry.metadata.contentType !== ContentType.BOOK_CHAPTER) return false

    const userProfile = userAnalytics.getUserProfile(context.userId)
    if (!userProfile) return false

    const readingSpeed = userProfile.behavior.readingHabits.readingSpeed
    // 简化的预测逻辑：如果用户阅读速度快，提前缓存更多章节
    return readingSpeed > 250 // 250字/分钟算是快读
  }

  private isPreferredGenre(entry: CacheEntry, context: CacheContext): boolean {
    const userProfile = userAnalytics.getUserProfile(context.userId)
    if (!userProfile || !entry.metadata.bookId) return false

    // 这里需要书籍信息的API调用来获取书籍类型
    // 简化实现：假设我们有某种方式获取书籍类型信息
    return true // 暂时返回true，需要实际实现
  }

  private isPredictedAccess(entry: CacheEntry, context: CacheContext): boolean {
    // 基于用户行为模式的预测访问
    const userProfile = userAnalytics.getUserProfile(context.userId)
    if (!userProfile) return false

    const currentHour = new Date(context.currentTime).getHours()
    const readingSchedule = userProfile.behavior.readingHabits.readingSchedule

    // 检查当前是否是用户的阅读高峰期
    const isPeakHour = readingSchedule.peakHours.some(
      peak => Math.abs(peak.hour - currentHour) <= 1 && peak.activity > 0.7
    )

    return isPeakHour && entry.metadata.contentType === ContentType.BOOK_CHAPTER
  }
}

class ContentPopularityStrategy implements CacheStrategy {
  id = 'content_popularity'
  name = '基于内容热门度的缓存'
  description = '优先缓存热门和 trending 内容'
  isActive = true
  priority = 8

  shouldCache(entry: CacheEntry, context: CacheContext): boolean {
    // 热门内容更容易被缓存
    return entry.metadata.popularityScore > 0.7 ||
      (entry.metadata.contentType === ContentType.RECOMMENDATIONS &&
        context.networkType === 'wifi')
  }

  calculatePriority(entry: CacheEntry, context: CacheContext): CachePriority {
    if (entry.metadata.popularityScore > 0.9) {
      return CachePriority.HIGH
    } else if (entry.metadata.popularityScore > 0.7) {
      return CachePriority.MEDIUM
    }
    return CachePriority.LOW
  }

  predictAccessProbability(entry: CacheEntry, context: CacheContext): number {
    // 热门内容的访问概率更高
    return Math.min(entry.metadata.popularityScore * 0.8 + 0.2, 1.0)
  }

  estimateExpiryTime(entry: CacheEntry, context: CacheContext): number {
    // 热门内容缓存时间更长
    const baseTime = 7200000 // 2小时
    return context.currentTime + baseTime * entry.metadata.popularityScore
  }
}

class NetworkAwareStrategy implements CacheStrategy {
  id = 'network_aware'
  name = '网络感知缓存'
  description = '根据网络状况智能调整缓存策略'
  isActive = true
  priority = 9

  shouldCache(entry: CacheEntry, context: CacheContext): boolean {
    switch (context.networkType) {
      case 'wifi':
        // WiFi环境下缓存更多内容
        return entry.size < 1024 * 1024 * 10 // 10MB
      case 'mobile':
        // 移动网络下只缓存重要内容
        return entry.metadata.contentType === ContentType.BOOK_CHAPTER &&
          entry.priority >= CachePriority.HIGH
      case 'offline':
        // 离线模式下优先缓存用户正在阅读的内容
        return entry.metadata.contentType === ContentType.BOOK_CHAPTER &&
          entry.metadata.userId === context.userId
      default:
        return false
    }
  }

  calculatePriority(entry: CacheEntry, context: CacheContext): CachePriority {
    let priority = entry.priority

    // 在移动网络下降低非关键内容的优先级
    if (context.networkType === 'mobile' &&
      entry.metadata.contentType !== ContentType.BOOK_CHAPTER) {
      priority = Math.max(priority - 1, CachePriority.LOW)
    }

    // 在离线模式下提高阅读内容的优先级
    if (context.networkType === 'offline' &&
      entry.metadata.contentType === ContentType.BOOK_CHAPTER) {
      priority = CachePriority.CRITICAL
    }

    return priority
  }

  predictAccessProbability(entry: CacheEntry, context: CacheContext): number {
    let probability = entry.accessCount > 0 ? 0.6 : 0.3

    // 网络状况影响访问概率
    switch (context.networkType) {
      case 'wifi':
        probability *= 1.2
        break
      case 'mobile':
        probability *= 0.8
        break
      case 'offline':
        probability *= 1.5 // 离线时更可能访问缓存内容
        break
    }

    return Math.min(probability, 1.0)
  }

  estimateExpiryTime(entry: CacheEntry, context: CacheContext): number {
    const baseTime = 3600000 // 1小时

    // 根据网络类型调整过期时间
    const multiplier = context.networkType === 'offline' ? 4 :
      context.networkType === 'wifi' ? 2 : 1

    return context.currentTime + baseTime * multiplier
  }
}

class BatteryAwareStrategy implements CacheStrategy {
  id = 'battery_aware'
  name = '电池感知缓存'
  description = '根据设备电池状态优化缓存策略'
  isActive = true
  priority = 7

  shouldCache(entry: CacheEntry, context: CacheContext): boolean {
    // 电量充足时可以缓存更多内容
    if (context.batteryLevel > 50) {
      return true
    }

    // 电量中等时只缓存高优先级内容
    if (context.batteryLevel > 20) {
      return entry.priority >= CachePriority.MEDIUM
    }

    // 电量低时只缓存关键内容
    return entry.priority >= CachePriority.CRITICAL
  }

  calculatePriority(entry: CacheEntry, context: CacheContext): CachePriority {
    // 电量低时降低所有内容的优先级，除了关键内容
    if (context.batteryLevel < 20 && entry.priority < CachePriority.CRITICAL) {
      return Math.max(entry.priority - 1, CachePriority.LOW)
    }

    return entry.priority
  }

  predictAccessProbability(entry: CacheEntry, context: CacheContext): number {
    // 电量影响访问行为模式
    let probability = entry.accessCount > 0 ? 0.5 : 0.2

    if (context.batteryLevel < 20) {
      // 电量低时，用户更可能选择已缓存的内容
      probability *= 1.3
    }

    return Math.min(probability, 1.0)
  }

  estimateExpiryTime(entry: CacheEntry, context: CacheContext): number {
    // 电量低时缩短缓存时间以节省资源
    const baseTime = context.batteryLevel > 50 ? 7200000 :  // 2小时
      context.batteryLevel > 20 ? 3600000 :   // 1小时
        1800000 // 30分钟

    return context.currentTime + baseTime
  }
}

// ===== 智能缓存管理器 =====

class SmartCacheManager {
  private cache = new Map<string, CacheEntry>()
  private strategies: CacheStrategy[] = []
  private maxSize: number = 100 * 1024 * 1024 // 100MB 默认
  private currentSize: number = 0
  private hitCount: number = 0
  private missCount: number = 0

  constructor() {
    this.initializeStrategies()
  }

  // ===== 缓存操作 =====

  async get(key: string, context: CacheContext): Promise<any | null> {
    const entry = this.cache.get(key)

    if (!entry) {
      this.missCount++
      return null
    }

    // 检查是否过期
    if (entry.expiryTime && context.currentTime > entry.expiryTime) {
      this.cache.delete(key)
      this.currentSize -= entry.size
      this.missCount++
      return null
    }

    // 更新访问信息
    entry.accessCount++
    entry.lastAccessed = context.currentTime

    // 重新评估优先级
    entry.priority = this.calculateOverallPriority(entry, context)

    this.hitCount++

    logger.debug(`Cache hit: ${key}`)
    return entry.content
  }

  async set(key: string, content: any, metadata: CacheMetadata, context: CacheContext): Promise<boolean> {
    const size = this.estimateSize(content)

    // 创建缓存条目
    const entry: CacheEntry = {
      key,
      content,
      size,
      accessCount: 1,
      lastAccessed: context.currentTime,
      createdAt: context.currentTime,
      priority: this.calculateOverallPriorityFromMetadata(metadata, context),
      metadata
    }

    // 决定是否缓存
    if (!this.shouldCacheEntry(entry, context)) {
      return false
    }

    // 设置过期时间
    entry.expiryTime = this.calculateOverallExpiry(entry, context)

    // 检查容量限制
    if (this.currentSize + size > this.maxSize) {
      await this.evictEntries(context)
    }

    // 添加到缓存
    this.cache.set(key, entry)
    this.currentSize += size

    logger.debug(`Cache set: ${key}, size: ${size} bytes`)
    return true
  }

  async delete(key: string): Promise<boolean> {
    const entry = this.cache.get(key)
    if (entry) {
      this.cache.delete(key)
      this.currentSize -= entry.size
      return true
    }
    return false
  }

  async clear(): Promise<void> {
    this.cache.clear()
    this.currentSize = 0
    this.hitCount = 0
    this.missCount = 0
  }

  // ===== 智能决策 =====

  private shouldCacheEntry(entry: CacheEntry, context: CacheContext): boolean {
    // 应用所有活跃策略
    for (const strategy of this.strategies.filter(s => s.isActive)) {
      if (strategy.shouldCache(entry, context)) {
        return true
      }
    }
    return false
  }

  private calculateOverallPriority(entry: CacheEntry, context: CacheContext): CachePriority {
    let maxPriority = CachePriority.LOW

    for (const strategy of this.strategies.filter(s => s.isActive)) {
      const priority = strategy.calculatePriority(entry, context)
      maxPriority = Math.max(maxPriority, priority)
    }

    return maxPriority
  }

  private calculateOverallPriorityFromMetadata(metadata: CacheMetadata, context: CacheContext): CachePriority {
    // 创建临时条目来计算优先级
    const tempEntry: CacheEntry = {
      key: '',
      content: null,
      size: 0,
      accessCount: 0,
      lastAccessed: context.currentTime,
      createdAt: context.currentTime,
      priority: CachePriority.MEDIUM,
      metadata
    }

    return this.calculateOverallPriority(tempEntry, context)
  }

  private calculateOverallExpiry(entry: CacheEntry, context: CacheContext): number {
    let maxExpiry = context.currentTime + 1800000 // 30分钟默认

    for (const strategy of this.strategies.filter(s => s.isActive)) {
      const expiry = strategy.estimateExpiryTime(entry, context)
      maxExpiry = Math.max(maxExpiry, expiry)
    }

    return maxExpiry
  }

  private async evictEntries(context: CacheContext): Promise<void> {
    // 基于优先级和访问模式的智能淘汰
    const entries = Array.from(this.cache.values())

    // 计算每个条目的淘汰分数（越低越优先淘汰）
    const entriesWithScores = entries.map(entry => ({
      entry,
      score: this.calculateEvictionScore(entry, context)
    }))

    // 按分数排序（低分先淘汰）
    entriesWithScores.sort((a, b) => a.score - b.score)

    // 淘汰低优先级条目直到有足够空间
    let freedSpace = 0
    const targetFreeSpace = this.maxSize * 0.1 // 释放10%的空间

    for (const { entry } of entriesWithScores) {
      if (freedSpace >= targetFreeSpace) break

      this.cache.delete(entry.key)
      this.currentSize -= entry.size
      freedSpace += entry.size

      logger.debug(`Cache evicted: ${entry.key}`)
    }
  }

  private calculateEvictionScore(entry: CacheEntry, context: CacheContext): number {
    let score = 0

    // 优先级越低分数越低（更容易被淘汰）
    score += entry.priority * 10

    // 访问频率越低分数越低
    const accessFrequency = entry.accessCount / Math.max(1, (context.currentTime - entry.createdAt) / 3600000)
    score -= accessFrequency * 5

    // 最近访问越久远分数越低
    const timeSinceAccess = context.currentTime - entry.lastAccessed
    score += Math.log10(timeSinceAccess / 1000) // 对数衰减

    // 文件大小越大分数越低（大文件更容易被淘汰）
    score += Math.log10(entry.size) * 2

    return score
  }

  // ===== 辅助方法 =====

  private initializeStrategies(): void {
    this.strategies = [
      new UserBehaviorBasedStrategy(),
      new ContentPopularityStrategy(),
      new NetworkAwareStrategy(),
      new BatteryAwareStrategy()
    ]
  }

  private estimateSize(content: any): number {
    // 粗略估算内容大小
    if (typeof content === 'string') {
      return content.length * 2 // UTF-16
    }
    if (content instanceof ArrayBuffer) {
      return content.byteLength
    }
    if (content && typeof content === 'object') {
      return JSON.stringify(content).length * 2
    }
    return 1024 // 默认1KB
  }

  // ===== 配置和监控 =====

  setMaxSize(size: number): void {
    this.maxSize = size
  }

  getStats(): CacheStats {
    const totalRequests = this.hitCount + this.missCount
    const hitRate = totalRequests > 0 ? this.hitCount / totalRequests : 0

    return {
      totalEntries: this.cache.size,
      totalSize: this.currentSize,
      maxSize: this.maxSize,
      hitCount: this.hitCount,
      missCount: this.missCount,
      hitRate,
      evictionCount: 0, // 需要单独跟踪
      compressionRatio: 1.0, // 暂时不支持压缩
      strategiesActive: this.strategies.filter(s => s.isActive).length
    }
  }

  getActiveStrategies(): CacheStrategy[] {
    return this.strategies.filter(s => s.isActive)
  }

  enableStrategy(strategyId: string, enabled: boolean): void {
    const strategy = this.strategies.find(s => s.id === strategyId)
    if (strategy) {
      strategy.isActive = enabled
    }
  }

  // ===== 预加载和预测 =====

  async preloadRecommendedContent(userId: string, context: CacheContext): Promise<void> {
    try {
      // 获取个性化推荐
      const recommendations = await recommendationEngine.getRecommendations({
        userId,
        context: {
          userId,
          sessionId: '',
          timeOfDay: new Date(context.currentTime).getHours(),
          dayOfWeek: new Date(context.currentTime).getDay(),
          deviceType: context.userBehavior ? 'mobile' : 'desktop'
        },
        limit: 5
      })

      // 预加载推荐内容
      for (const rec of recommendations.recommendations.slice(0, 3)) {
        // 这里需要实际的内容加载逻辑
        // 暂时只记录预加载意图
        logger.debug(`Preloading recommended content: ${rec.bookId}`)
      }
    } catch (error) {
      logger.error('Failed to preload recommended content:', error)
    }
  }

  async predictAndCache(userId: string, context: CacheContext): Promise<void> {
    // 基于用户行为预测接下来可能需要的内容
    const userProfile = userAnalytics.getUserProfile(userId)
    if (!userProfile) return

    const currentHour = new Date(context.currentTime).getHours()

    // 检查是否是用户的阅读高峰期
    const isPeakHour = userProfile.behavior.readingHabits.readingSchedule.peakHours
      .some(peak => Math.abs(peak.hour - currentHour) <= 1)

    if (isPeakHour) {
      // 在高峰期预加载更多内容
      await this.preloadRecommendedContent(userId, context)
    }
  }
}

export interface CacheStats {
  totalEntries: number
  totalSize: number
  maxSize: number
  hitCount: number
  missCount: number
  hitRate: number
  evictionCount: number
  compressionRatio: number
  strategiesActive: number
}

// ===== 全局实例 =====

export const smartCacheManager = new SmartCacheManager()

// ===== Vue 插件 =====

export const smartCachePlugin = {
  install(app: any) {
    app.config.globalProperties.$smartCache = smartCacheManager
    app.provide('smartCache', smartCacheManager)
  }
}

// ===== 便捷方法 =====

export const useSmartCache = () => smartCacheManager

export default smartCacheManager