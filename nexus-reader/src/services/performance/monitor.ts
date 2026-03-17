/**
 * 性能监控工具
 * 用于追踪关键业务指标：内容解析耗时、首屏渲染、网络延迟等
 */
import { logger } from '../../utils/logger'
import { queueClientMetric } from './client-reporter'

export interface PerformanceMetric {
    name: string
    value: number
    unit: 'ms' | 's'
    tags?: Record<string, string | number>
}

class PerformanceMonitor {
    private static instance: PerformanceMonitor
    private marks: Map<string, number> = new Map()

    private constructor() { }

    static getInstance(): PerformanceMonitor {
        if (!PerformanceMonitor.instance) {
            PerformanceMonitor.instance = new PerformanceMonitor()
        }
        return PerformanceMonitor.instance
    }

    /**
     * 开始计时
     * @param key 标识符
     */
    startMark(key: string) {
        this.marks.set(key, performance.now())
    }

    /**
     * 结束计时并记录指标
     * @param key 标识符
     * @param metricName 最终上报的指标名称
     * @param tags 附加标签
     */
    endMark(key: string, metricName?: string, tags?: Record<string, string | number>) {
        const startTime = this.marks.get(key)
        if (startTime === undefined) return

        const duration = performance.now() - startTime
        this.marks.delete(key)

        this.record({
            name: metricName || key,
            value: Number(duration.toFixed(2)),
            unit: 'ms',
            tags
        })

        return duration
    }

    /**
     * 记录静态指标
     */
    record(metric: PerformanceMetric) {
        // 1. 打印到控制台 (仅开发环境或通过 logger)
        if (import.meta.env.DEV) {
            console.debug(`[Performance] ${metric.name}: ${metric.value}${metric.unit}`, metric.tags || '')
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

    /**
     * 监控 Web Vitals
     * Note: Using native PerformanceObserver API for LCP/FID/CLS monitoring
     */
    observeWebVitals() {
        if (typeof window === 'undefined') return

        // Native Web Vitals monitoring using PerformanceObserver
        try {
            const observer = new PerformanceObserver((entryList) => {
                for (const entry of entryList.getEntries()) {
                    this.record({
                        name: `Vital-${entry.name}`,
                        value: Number(entry.startTime.toFixed(2)),
                        unit: 'ms'
                    })
                }
            })
            observer.observe({ type: 'largest-contentful-paint', buffered: true })
            observer.observe({ type: 'first-input', buffered: true })
            observer.observe({ type: 'layout-shift', buffered: true })
        } catch {
            // Browser doesn't support PerformanceObserver or specific entry types
            logger.debug('Web Vitals monitoring not available')
        }
    }
}

export const perfMonitor = PerformanceMonitor.getInstance()
