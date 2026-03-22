/**
 * 性能监控工具
 * 用于追踪关键业务指标：内容解析耗时、首屏渲染、网络延迟等
 */
import { logger } from '../../utils/logger'
import { queueClientMetric } from './client-reporter'

interface PerformanceMetric {
    name: string
    value: number
    unit: 'ms' | 's'
    tags?: Record<string, string | number>
}

class PerformanceMonitor {
    private static instance: PerformanceMonitor

    private constructor() { }

    static getInstance(): PerformanceMonitor {
        if (!PerformanceMonitor.instance) {
            PerformanceMonitor.instance = new PerformanceMonitor()
        }
        return PerformanceMonitor.instance
    }

    /**
     * 记录静态指标
     */
    record(metric: PerformanceMetric) {
        // 1. 仅开发环境记录调试日志
        if (import.meta.env.DEV) {
            logger.debug(`[Performance] ${metric.name}: ${metric.value}${metric.unit}`, metric.tags || {})
        }

        // 2. 使用 logger 记录（可后续通过后台采集）
        logger.info(`[Perf] ${metric.name}`, {
            value: metric.value,
            unit: metric.unit,
            ...metric.tags
        })

        // Best-effort: buffer a subset of metrics and flush periodically to Worker.
        try {
            queueClientMetric(metric)
        } catch {
            // ignore reporter failures
        }

        // 3. 可选：上报到分析平台 (Google Analytics / Custom Endpoint)
        // if (!import.meta.env.DEV) {
        //   reportToAnalytics(metric)
        // }
    }
}

export const perfMonitor = PerformanceMonitor.getInstance()
