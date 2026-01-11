/**
 * 隐私合规日志记录属性测试
 * 验证隐私合规日志记录系统的正确性属性
 * 
 * **属性25: 隐私合规日志**
 * **验证: 需求 8.5**
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fc from 'fast-check'
import { PrivacyLogger } from '../utils/privacyLogger'

describe('隐私合规日志记录属性测试 (Property 25)', () => {
  let privacyLogger: PrivacyLogger

  beforeEach(() => {
    privacyLogger = new PrivacyLogger()
    privacyLogger.clearLogs() // Ensure clean state
    vi.clearAllMocks()
  })

  afterEach(() => {
    privacyLogger.clearLogs()
  })

  describe('属性25: 隐私合规日志', () => {
    it('对于任何日志条目，系统应该自动清理PII并确保隐私合规', async () => {
      await fc.assert(fc.asyncProperty(
        fc.record({
          level: fc.constantFrom('info', 'warn', 'error', 'debug'),
          message: fc.string({ minLength: 1, maxLength: 200 }),
          context: fc.record({
            userId: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
            sessionId: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
            action: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
            ip: fc.option(fc.string({ minLength: 7, maxLength: 15 }))
          })
        }),
        async (logData) => {
          // Property: Any log entry should have required privacy fields
          const logEntry = await privacyLogger.log(
            logData.level as any,
            logData.message,
            logData.context
          )

          // Ensure we have a valid log entry
          expect(logEntry).toBeDefined()
          if (!logEntry) return

          // 验证日志条目结构
          expect(logEntry).toHaveProperty('id')
          expect(logEntry).toHaveProperty('timestamp')
          expect(logEntry).toHaveProperty('level')
          expect(logEntry).toHaveProperty('message')
          expect(logEntry).toHaveProperty('privacyLevel')
          expect(logEntry).toHaveProperty('piiCleaned')
          expect(logEntry).toHaveProperty('anonymized')
          expect(logEntry).toHaveProperty('encrypted')

          // 验证隐私字段
          expect(typeof logEntry.piiCleaned).toBe('boolean')
          expect(typeof logEntry.anonymized).toBe('boolean')
          expect(typeof logEntry.encrypted).toBe('boolean')
          expect(['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'PERSONAL']).toContain(
            (logEntry.privacyLevel || logEntry.privacy)?.toString().toUpperCase()
          )

          // 验证时间戳
          const testEndTime = Date.now() + 10 // Add small buffer for timing
          expect(logEntry.timestamp).toBeGreaterThan(0)
          expect(logEntry.timestamp).toBeLessThanOrEqual(testEndTime)
        }
      ), { numRuns: 50 })
    })

    it('应该自动清理邮箱地址等PII信息', async () => {
      await fc.assert(fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }),
        fc.constantFrom('@gmail.com', '@yahoo.com', '@hotmail.com', '@test.com'),
        async (username, domain) => {
          const email = `${username}${domain}`
          const message = `用户 ${email} 执行了操作`

          // Property: Email addresses in log messages should be automatically cleaned
          const logEntry = await privacyLogger.log('info', message)

          // Ensure we have a valid log entry
          expect(logEntry).toBeDefined()
          if (!logEntry) return

          // 验证邮箱被清理
          expect(logEntry.message).not.toContain(email)
          expect(logEntry.message).toContain('[EMAIL_REDACTED]')
          expect(logEntry.piiCleaned).toBe(true)
        }
      ), { numRuns: 30 })
    })

    it('应该对用户ID进行匿名化处理', async () => {
      await fc.assert(fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 50 }),
        async (userId) => {
          const context = { userId }

          // Property: User IDs should be anonymized in logs
          const logEntry = await privacyLogger.log('info', '用户操作', context)

          // Ensure we have a valid log entry
          expect(logEntry).toBeDefined()
          if (!logEntry) return

          // 验证用户ID匿名化
          if (logEntry.context?.userId) {
            expect(logEntry.context.userId).not.toBe(userId)
            expect(logEntry.context.userId).toMatch(/^[a-f0-9]{64}$/) // SHA-256 hash
          }
          expect(logEntry.anonymized).toBe(true)
        }
      ), { numRuns: 30 })
    })

    it('应该在同一会话中保持会话ID一致性', async () => {
      await fc.assert(fc.asyncProperty(
        fc.string({ minLength: 10, maxLength: 50 }),
        fc.array(fc.string({ minLength: 1, maxLength: 100 }), { minLength: 2, maxLength: 5 }),
        async (sessionId, messages) => {
          const logEntries: any[] = []

          // Property: Session ID should be consistent across logs in the same session
          for (const message of messages) {
            const logEntry = await privacyLogger.log('info', message, { sessionId })
            logEntries.push(logEntry)
          }

          // 验证会话ID一致性
          const sessionIds = logEntries.map(entry => entry.sessionId).filter(Boolean)
          if (sessionIds.length > 1) {
            const firstSessionId = sessionIds[0]
            sessionIds.forEach(id => {
              expect(id).toBe(firstSessionId)
            })
          }
        }
      ), { numRuns: 20 })
    })

    it('应该正确按隐私级别过滤日志', async () => {
      await fc.assert(fc.asyncProperty(
        fc.constantFrom('PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'PERSONAL'),
        fc.array(fc.record({
          level: fc.constantFrom('info', 'warn', 'error'),
          message: fc.string({ minLength: 1, maxLength: 100 })
        }), { minLength: 3, maxLength: 10 }),
        async (targetPrivacyLevel, logData) => {
          // 创建不同隐私级别的日志
          for (const data of logData) {
            await privacyLogger.log(data.level as any, data.message)
          }

          // Property: Privacy level filtering should return only logs at or below the specified level
          const filteredLogs = privacyLogger.getLogsByPrivacyLevel(targetPrivacyLevel as any)

          // 验证过滤结果
          filteredLogs.forEach(log => {
            const levels = ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'PERSONAL']
            const targetIndex = levels.indexOf(targetPrivacyLevel)
            const logIndex = levels.indexOf(log.privacyLevel)
            expect(logIndex).toBeLessThanOrEqual(targetIndex)
          })
        }
      ), { numRuns: 20 })
    })

    it('应该正确处理安全事件中的敏感数据', async () => {
      await fc.assert(fc.asyncProperty(
        fc.record({
          password: fc.string({ minLength: 8, maxLength: 20 }),
          token: fc.string({ minLength: 20, maxLength: 50 }),
          apiKey: fc.string({ minLength: 16, maxLength: 40 })
        }),
        async (securityData) => {
          const message = `安全事件: password=${securityData.password}, token=${securityData.token}`
          const context = { 
            type: 'security',
            apiKey: securityData.apiKey
          }

          // Property: Security events should redact sensitive data with [SECURITY_REDACTED]
          const logEntry = await privacyLogger.log('error', message, context)

          // Ensure we have a valid log entry
          expect(logEntry).toBeDefined()
          if (!logEntry) return

          // 验证敏感数据被标记
          expect(logEntry.message).toContain('[SECURITY_REDACTED]')
          expect(logEntry.message).not.toContain(securityData.password)
          expect(logEntry.message).not.toContain(securityData.token)
          
          if (logEntry.context?.apiKey) {
            expect(logEntry.context.apiKey).toBe('[SECURITY_REDACTED]')
          }
        }
      ), { numRuns: 30 })
    })

    it('应该支持JSON格式的日志导出', async () => {
      await fc.assert(fc.asyncProperty(
        fc.array(fc.record({
          level: fc.constantFrom('info', 'warn', 'error'),
          message: fc.string({ minLength: 1, maxLength: 100 })
        }), { minLength: 1, maxLength: 5 }),
        async (logData) => {
          // 创建日志条目
          for (const data of logData) {
            await privacyLogger.log(data.level as any, data.message)
          }

          // Property: JSON export should be valid and contain all log entries
          const exportedJson = privacyLogger.exportLogs('json')

          // 验证JSON格式
          expect(() => JSON.parse(exportedJson)).not.toThrow()
          
          const parsedLogs = JSON.parse(exportedJson)
          expect(Array.isArray(parsedLogs)).toBe(true)
          expect(parsedLogs.length).toBeGreaterThan(0)

          // 验证每个日志条目的结构
          parsedLogs.forEach((log: any) => {
            expect(log).toHaveProperty('id')
            expect(log).toHaveProperty('timestamp')
            expect(log).toHaveProperty('level')
            expect(log).toHaveProperty('message')
            expect(log).toHaveProperty('privacyLevel')
          })
        }
      ), { numRuns: 20 })
    })

    it('应该生成有意义的隐私合规报告', async () => {
      await fc.assert(fc.asyncProperty(
        fc.array(fc.record({
          level: fc.constantFrom('info', 'warn', 'error'),
          message: fc.string({ minLength: 1, maxLength: 100 }),
          hasEmail: fc.boolean(),
          hasUserId: fc.boolean()
        }), { minLength: 5, maxLength: 15 }),
        async (logData) => {
          // 创建包含不同隐私特征的日志
          for (const data of logData) {
            const message = data.hasEmail ? 
              `${data.message} user@example.com` : 
              data.message
            const context = data.hasUserId ? 
              { userId: `user-${Math.random()}` } : 
              undefined

            await privacyLogger.log(data.level as any, message, context)
          }

          // Property: Privacy compliance report should contain basic metrics
          const report = privacyLogger.getPrivacyComplianceReport()

          // 验证报告基本指标
          expect(report).toHaveProperty('totalLogs')
          expect(report).toHaveProperty('piiCleanedCount')
          expect(report).toHaveProperty('anonymizedCount')
          expect(report).toHaveProperty('encryptedCount')
          expect(report).toHaveProperty('privacyLevelDistribution')

          expect(typeof report.totalLogs).toBe('number')
          expect(typeof report.piiCleanedCount).toBe('number')
          expect(typeof report.anonymizedCount).toBe('number')
          expect(typeof report.encryptedCount).toBe('number')

          expect(report.totalLogs).toBeGreaterThan(0)
          expect(report.piiCleanedCount).toBeGreaterThanOrEqual(0)
          expect(report.anonymizedCount).toBeGreaterThanOrEqual(0)
        }
      ), { numRuns: 15 })
    })

    it('应该正确处理IP地址掩码', async () => {
      await fc.assert(fc.asyncProperty(
        fc.tuple(
          fc.integer({ min: 1, max: 255 }),
          fc.integer({ min: 0, max: 255 }),
          fc.integer({ min: 0, max: 255 }),
          fc.integer({ min: 1, max: 255 })
        ),
        async ([a, b, c, d]) => {
          const ip = `${a}.${b}.${c}.${d}`
          const context = { 
            type: 'security',
            ip: ip
          }

          // Property: IP addresses in security context should be masked
          const logEntry = await privacyLogger.log('warn', '安全警告', context)

          // Ensure we have a valid log entry
          expect(logEntry).toBeDefined()
          if (!logEntry) return

          // 验证IP地址掩码
          if (logEntry.context?.ip) {
            expect(logEntry.context.ip).toMatch(/^\d+\.\d+\.xxx\.xxx$/)
            expect(logEntry.context.ip).not.toBe(ip)
          }
        }
      ), { numRuns: 30 })
    })

    it('应该按时间戳正确排序日志（最新优先）', async () => {
      await fc.assert(fc.asyncProperty(
        fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 3, maxLength: 8 }),
        async (messages) => {
          // 清理之前的日志以避免干扰
          privacyLogger.clearLogs()
          
          const startTime = Date.now()
          const logTimestamps: number[] = []
          
          // 创建日志条目（有足够的时间间隔）
          for (let i = 0; i < messages.length; i++) {
            const beforeLog = Date.now()
            await privacyLogger.log('info', messages[i])
            logTimestamps.push(beforeLog)
            // 增加更长的延迟确保时间戳不同
            await new Promise(resolve => setTimeout(resolve, 10))
          }

          // Property: Logs should be sorted by timestamp (newest first)
          const logs = privacyLogger.getLogs()

          // 验证日志数量正确
          expect(logs.length).toBe(messages.length)

          // 验证时间戳排序（最新的在前面）
          for (let i = 0; i < logs.length - 1; i++) {
            expect(logs[i].timestamp).toBeGreaterThanOrEqual(logs[i + 1].timestamp)
          }

          // 验证所有时间戳都在合理范围内
          logs.forEach(log => {
            expect(log.timestamp).toBeGreaterThanOrEqual(startTime)
            expect(log.timestamp).toBeLessThanOrEqual(Date.now())
          })
        }
      ), { numRuns: 10 })
    })

    it('应该正确处理不同日志级别', async () => {
      await fc.assert(fc.asyncProperty(
        fc.constantFrom('debug', 'info', 'warn', 'error'),
        fc.string({ minLength: 1, maxLength: 100 }),
        async (level, message) => {
          // Property: Log level should be correctly processed and stored
          const logEntry = await privacyLogger.log(level as any, message)

          // Ensure we have a valid log entry
          expect(logEntry).toBeDefined()
          if (!logEntry) return

          // 验证日志级别
          expect(logEntry.level).toBe(level.toUpperCase())
          expect(['DEBUG', 'INFO', 'WARN', 'ERROR']).toContain(logEntry.level)

          // 验证消息内容
          expect(logEntry.message).toBeDefined()
          expect(typeof logEntry.message).toBe('string')
        }
      ), { numRuns: 40 })
    })
  })
})