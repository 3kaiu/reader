/**
 * 阅读领域 (Reading Domain)
 *
 * 阅读领域负责前端的阅读相关业务逻辑，包括：
 * - 书籍状态管理
 * - 阅读进度跟踪
 * - 章节内容展示
 * - 阅读设置管理
 */

import { DomainError, getDomainLayer } from './index'
import type {
  AggregateRoot,
  ValueObject,
  DomainEvent,
  DomainResult,
  BusinessRuleValidator,
} from './index'

// ===== 阅读领域事件 =====

export class BookOpenedEvent implements DomainEvent {
  eventId: string
  eventType = 'BookOpened'
  timestamp: Date
  aggregateId: string
  eventData: Record<string, any>

  constructor(bookId: string, chapterId?: string) {
    this.eventId = crypto.randomUUID()
    this.timestamp = new Date()
    this.aggregateId = bookId
    this.eventData = { chapterId }
  }
}

export class ReadingProgressUpdatedEvent implements DomainEvent {
  eventId: string
  eventType = 'ReadingProgressUpdated'
  timestamp: Date
  aggregateId: string
  eventData: Record<string, any>

  constructor(bookId: string, chapterId: string, progress: number) {
    this.eventId = crypto.randomUUID()
    this.timestamp = new Date()
    this.aggregateId = bookId
    this.eventData = { chapterId, progress }
  }
}

export class ReadingPreferencesChangedEvent implements DomainEvent {
  eventId: string
  eventType = 'ReadingPreferencesChanged'
  timestamp: Date
  aggregateId: string
  eventData: Record<string, any>

  constructor(userId: string, settings: ReadingPreferences) {
    this.eventId = crypto.randomUUID()
    this.timestamp = new Date()
    this.aggregateId = userId
    this.eventData = { settings }
  }
}

// ===== 值对象 =====

/**
 * 阅读设置值对象
 */
export class ReadingPreferences implements ValueObject {
  fontSize: number
  fontFamily: string
  lineHeight: number
  theme: 'light' | 'dark' | 'auto'
  pageWidth: number
  autoScroll: boolean
  scrollSpeed: number

  constructor(settings: Partial<ReadingPreferences> = {}) {
    this.fontSize = settings.fontSize ?? 16
    this.fontFamily = settings.fontFamily ?? 'default'
    this.lineHeight = settings.lineHeight ?? 1.5
    this.theme = settings.theme ?? 'auto'
    this.pageWidth = settings.pageWidth ?? 800
    this.autoScroll = settings.autoScroll ?? false
    this.scrollSpeed = settings.scrollSpeed ?? 50
  }

  equals(other: ValueObject): boolean {
    if (!(other instanceof ReadingPreferences)) return false
    return (
      this.fontSize === other.fontSize &&
      this.fontFamily === other.fontFamily &&
      this.lineHeight === other.lineHeight &&
      this.theme === other.theme &&
      this.pageWidth === other.pageWidth &&
      this.autoScroll === other.autoScroll &&
      this.scrollSpeed === other.scrollSpeed
    )
  }
}

/**
 * 阅读进度值对象
 */
export class ReadingProgress implements ValueObject {
  bookId: string
  chapterId: string
  position: number // 0-100
  scrollTop: number
  timestamp: Date

  constructor(progress: Partial<ReadingProgress>) {
    this.bookId = progress.bookId!
    this.chapterId = progress.chapterId!
    this.position = progress.position ?? 0
    this.scrollTop = progress.scrollTop ?? 0
    this.timestamp = progress.timestamp ?? new Date()
  }

  equals(other: ValueObject): boolean {
    if (!(other instanceof ReadingProgress)) return false
    return (
      this.bookId === other.bookId &&
      this.chapterId === other.chapterId &&
      this.position === other.position &&
      this.scrollTop === other.scrollTop
    )
  }

  isCompleted(): boolean {
    return this.position >= 100
  }
}

/**
 * 书签值对象
 */
export class Bookmark implements ValueObject {
  id: string
  chapterId: string
  position: number
  note?: string
  createdAt: Date

  constructor(bookmark: Partial<Bookmark>) {
    this.id = bookmark.id ?? crypto.randomUUID()
    this.chapterId = bookmark.chapterId!
    this.position = bookmark.position ?? 0
    this.note = bookmark.note
    this.createdAt = bookmark.createdAt ?? new Date()
  }

  equals(other: ValueObject): boolean {
    if (!(other instanceof Bookmark)) return false
    return (
      this.id === other.id &&
      this.chapterId === other.chapterId &&
      this.position === other.position &&
      this.note === other.note
    )
  }
}

// ===== 聚合根 =====

/**
 * 阅读会话聚合根
 */
export class ReadingSession implements AggregateRoot {
  id: string
  userId: string
  bookId: string
  startTime: Date
  endTime?: Date
  currentChapterId?: string
  progress: ReadingProgress[]
  bookmarks: Bookmark[]
  settings: ReadingPreferences
  version: number
  createdAt: Date
  updatedAt: Date
  uncommittedEvents: DomainEvent[] = []

  constructor(session: Partial<ReadingSession>) {
    this.id = session.id ?? crypto.randomUUID()
    this.userId = session.userId!
    this.bookId = session.bookId!
    this.startTime = session.startTime ?? new Date()
    this.endTime = session.endTime
    this.currentChapterId = session.currentChapterId
    this.progress = session.progress ?? []
    this.bookmarks = session.bookmarks ?? []
    this.settings = session.settings ?? new ReadingPreferences()
    this.version = session.version ?? 0
    this.createdAt = session.createdAt ?? new Date()
    this.updatedAt = session.updatedAt ?? new Date()
  }

  addDomainEvent(event: DomainEvent): void {
    this.uncommittedEvents.push(event)
  }

  getUncommittedEvents(): DomainEvent[] {
    return [...this.uncommittedEvents]
  }

  clearUncommittedEvents(): void {
    this.uncommittedEvents = []
  }

  /**
   * 开始阅读章节
   */
  startChapter(chapterId: string): void {
    this.currentChapterId = chapterId
    this.updatedAt = new Date()

    this.addDomainEvent(new BookOpenedEvent(this.bookId, chapterId))
  }

  /**
   * 更新阅读进度
   */
  updateProgress(chapterId: string, position: number, scrollTop: number): void {
    const progress = new ReadingProgress({
      bookId: this.bookId,
      chapterId,
      position,
      scrollTop,
      timestamp: new Date(),
    })

    // 更新或添加进度
    const existingIndex = this.progress.findIndex(p => p.chapterId === chapterId)
    if (existingIndex >= 0) {
      this.progress[existingIndex] = progress
    } else {
      this.progress.push(progress)
    }

    this.updatedAt = new Date()
    this.addDomainEvent(new ReadingProgressUpdatedEvent(this.bookId, chapterId, position))
  }

  /**
   * 添加书签
   */
  addBookmark(chapterId: string, position: number, note?: string): void {
    const bookmark = new Bookmark({
      chapterId,
      position,
      note,
    })

    this.bookmarks.push(bookmark)
    this.updatedAt = new Date()
  }

  /**
   * 结束阅读会话
   */
  endSession(): void {
    this.endTime = new Date()
    this.updatedAt = new Date()
  }

  /**
   * 获取总阅读时间（分钟）
   */
  getTotalReadingTime(): number {
    if (!this.endTime) return 0
    return (this.endTime.getTime() - this.startTime.getTime()) / (1000 * 60)
  }

  /**
   * 获取完成章节数
   */
  getCompletedChaptersCount(): number {
    return this.progress.filter(p => p.isCompleted()).length
  }
}

// ===== 领域服务 =====

/**
 * 阅读统计服务
 */
export class ReadingStatisticsService {
  name = 'reading_statistics_service'

  async calculateReadingStats(session: ReadingSession): Promise<DomainResult<ReadingStatistics>> {
    const startTime = Date.now()

    try {
      const stats: ReadingStatistics = {
        totalSessions: 1,
        totalReadingTime: session.getTotalReadingTime(),
        completedChapters: session.getCompletedChaptersCount(),
        averageSessionTime: session.getTotalReadingTime(),
        bookmarksCount: session.bookmarks.length,
        lastReadAt: session.updatedAt,
      }

      return {
        success: true,
        data: stats,
        events: [],
        metadata: {},
        executionTimeMs: Date.now() - startTime,
      }
    } catch (error: any) {
      return {
        success: false,
        events: [],
        metadata: { error: error.message },
        executionTimeMs: Date.now() - startTime,
      }
    }
  }
}

/**
 * 阅读偏好服务
 */
export class ReadingPreferencesService {
  name = 'reading_preferences_service'

  async optimizeSettings(
    userId: string,
    device: ReadingDeviceInfo
  ): Promise<DomainResult<ReadingPreferences>> {
    const startTime = Date.now()

    try {
      // 基于设备信息优化阅读设置
      let settings = new ReadingPreferences()

      if (device.type === 'mobile') {
        settings.fontSize = 18
        settings.pageWidth = device.screenWidth ?? 375
      } else if (device.type === 'tablet') {
        settings.fontSize = 20
        settings.pageWidth = 600
      }

      return {
        success: true,
        data: settings,
        events: [new ReadingPreferencesChangedEvent(userId, settings)],
        metadata: { optimized: true },
        executionTimeMs: Date.now() - startTime,
      }
    } catch (error: any) {
      return {
        success: false,
        events: [],
        metadata: { error: error.message },
        executionTimeMs: Date.now() - startTime,
      }
    }
  }
}

// ===== 业务规则 =====

/**
 * 阅读进度验证规则
 */
export class ReadingProgressValidRule implements BusinessRuleValidator<ReadingSession> {
  ruleName = 'reading_progress_valid'
  description = 'Ensures reading progress is within valid range'

  validate(entity: ReadingSession, _context: any): void {
    for (const progress of entity.progress) {
      if (progress.position < 0 || progress.position > 100) {
        throw new DomainError(
          'Reading progress must be between 0 and 100',
          'VALIDATION_ERROR',
          'reading'
        )
      }
    }
  }
}

/**
 * 阅读设置验证规则
 */
export class ReadingPreferencesValidRule implements BusinessRuleValidator<ReadingSession> {
  ruleName = 'reading_settings_valid'
  description = 'Ensures reading settings are within valid ranges'

  validate(entity: ReadingSession, _context: any): void {
    const settings = entity.settings

    if (settings.fontSize < 12 || settings.fontSize > 32) {
      throw new DomainError('Font size must be between 12 and 32', 'VALIDATION_ERROR', 'reading')
    }

    if (settings.lineHeight < 1.0 || settings.lineHeight > 3.0) {
      throw new DomainError(
        'Line height must be between 1.0 and 3.0',
        'VALIDATION_ERROR',
        'reading'
      )
    }
  }
}

// ===== 类型定义 =====

export interface ReadingStatistics {
  totalSessions: number
  totalReadingTime: number
  completedChapters: number
  averageSessionTime: number
  bookmarksCount: number
  lastReadAt: Date
}

export interface ReadingDeviceInfo {
  type: 'mobile' | 'tablet' | 'desktop'
  screenWidth?: number
  screenHeight?: number
  orientation?: 'portrait' | 'landscape'
}

// ===== 领域状态管理 =====

/**
 * 阅读领域状态
 */
export interface ReadingDomainState {
  currentSession?: ReadingSession
  recentBooks: string[]
  readingStats: ReadingStatistics
  userPreferences: ReadingPreferences
  bookmarks: Bookmark[]
}

/**
 * 阅读领域状态管理器
 */
export class ReadingDomainStateManager {
  private domainLayer = getDomainLayer()
  private stateManager = this.domainLayer.getStateManager()

  /**
   * 获取阅读领域状态
   */
  getState(): ReadingDomainState {
    return (
      this.stateManager.getState<ReadingDomainState>('reading') ?? {
        recentBooks: [],
        readingStats: {
          totalSessions: 0,
          totalReadingTime: 0,
          completedChapters: 0,
          averageSessionTime: 0,
          bookmarksCount: 0,
          lastReadAt: new Date(),
        },
        userPreferences: new ReadingPreferences(),
        bookmarks: [],
      }
    )
  }

  /**
   * 更新当前阅读会话
   */
  setCurrentSession(session: ReadingSession): void {
    const state = this.getState()
    state.currentSession = session
    this.stateManager.setState('reading', state)
  }

  /**
   * 添加最近阅读的书籍
   */
  addRecentBook(bookId: string): void {
    const state = this.getState()
    const index = state.recentBooks.indexOf(bookId)
    if (index > 0) {
      state.recentBooks.splice(index, 1)
    }
    if (index !== 0) {
      state.recentBooks.unshift(bookId)
    }
    // 保留最近10本书
    state.recentBooks = state.recentBooks.slice(0, 10)
    this.stateManager.setState('reading', state)
  }

  /**
   * 更新阅读统计
   */
  updateReadingStats(stats: ReadingStatistics): void {
    const state = this.getState()
    state.readingStats = stats
    this.stateManager.setState('reading', state)
  }

  /**
   * 更新用户偏好设置
   */
  updateUserPreferences(preferences: ReadingPreferences): void {
    const state = this.getState()
    state.userPreferences = preferences
    this.stateManager.setState('reading', state)
  }

  /**
   * 添加书签
   */
  addBookmark(bookmark: Bookmark): void {
    const state = this.getState()
    state.bookmarks.push(bookmark)
    // 保留最近100个书签
    state.bookmarks = state.bookmarks.slice(-100)
    this.stateManager.setState('reading', state)
  }
}

// ===== 全局实例 =====

let readingStateManager: ReadingDomainStateManager | null = null

/**
 * 获取阅读领域状态管理器
 */
export function getReadingStateManager(): ReadingDomainStateManager {
  if (!readingStateManager) {
    readingStateManager = new ReadingDomainStateManager()
  }
  return readingStateManager
}
