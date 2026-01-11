/**
 * Analytics API Client
 * Handles communication with Cloudflare Workers analytics endpoint
 * Validates Requirement 7.1: Performance metrics collection
 */

import type { AnalyticsEvent, PerformanceMetrics } from '../utils/analytics';

export interface AnalyticsConfig {
  endpoint: string;
  batchSize: number;
  flushInterval: number;
  retryAttempts: number;
  retryDelay: number;
}

export interface CloudflareAnalyticsData {
  siteTag: string;
  events: AnalyticsEvent[];
  timestamp: number;
  sessionId: string;
}

export interface AnalyticsResponse {
  success: boolean;
  processed: number;
  errors?: string[];
  rateLimitRemaining?: number;
}

export interface ErrorLogResponse {
  success: boolean;
  fingerprint?: string;
  count?: number;
  message?: string;
}

class AnalyticsAPI {
  private config: AnalyticsConfig;
  private eventBuffer: AnalyticsEvent[] = [];
  private flushTimer?: NodeJS.Timeout;
  private isProcessing: boolean = false;

  constructor(config: Partial<AnalyticsConfig> = {}) {
    this.config = {
      endpoint: '/api/analytics',
      batchSize: 50,
      flushInterval: 30000, // 30 seconds
      retryAttempts: 3,
      retryDelay: 1000,
      ...config,
    };

    this.startFlushTimer();
  }

  /**
   * Send analytics events to Cloudflare Workers
   */
  public async sendEvents(events: AnalyticsEvent[]): Promise<AnalyticsResponse> {
    if (events.length === 0) {
      return { success: true, processed: 0 };
    }

    const payload: CloudflareAnalyticsData = {
      siteTag: this.getSiteTag(),
      events,
      timestamp: Date.now(),
      sessionId: events[0]?.sessionId || 'unknown',
    };

    return this.sendWithRetry(payload);
  }

  /**
   * Buffer events for batch processing
   */
  public bufferEvents(events: AnalyticsEvent[]): void {
    this.eventBuffer.push(...events);

    if (this.eventBuffer.length >= this.config.batchSize) {
      this.flushBuffer();
    }
  }

  /**
   * Send custom performance metrics
   */
  public async sendPerformanceMetrics(metrics: PerformanceMetrics): Promise<void> {
    const event: AnalyticsEvent = {
      eventType: 'performance_metrics',
      sessionId: this.generateSessionId(),
      timestamp: Date.now(),
      properties: {},
      performance: metrics,
    };

    await this.sendEvents([event]);
  }

  /**
   * Send real user monitoring (RUM) data
   */
  public async sendRUMData(rumData: {
    pageLoadTime: number;
    firstContentfulPaint: number;
    largestContentfulPaint: number;
    cumulativeLayoutShift: number;
    firstInputDelay: number;
  }): Promise<void> {
    const event: AnalyticsEvent = {
      eventType: 'rum_metrics',
      sessionId: this.generateSessionId(),
      timestamp: Date.now(),
      properties: rumData,
    };

    await this.sendEvents([event]);
  }

  /**
   * Track Cloudflare-specific metrics
   */
  public async trackCloudflareMetrics(metrics: {
    cacheHitRatio: number;
    edgeResponseTime: number;
    originResponseTime: number;
    bandwidthSaved: number;
    requestsServed: number;
  }): Promise<void> {
    const event: AnalyticsEvent = {
      eventType: 'cloudflare_metrics',
      sessionId: this.generateSessionId(),
      timestamp: Date.now(),
      properties: metrics,
    };

    await this.sendEvents([event]);
  }

  /**
   * Track resource usage against free tier limits
   */
  public async trackResourceLimits(usage: {
    kvReads: number;
    kvWrites: number;
    workerRequests: number;
    cdnBandwidth: number;
    imageTransformations: number;
    aiRequests: number;
  }): Promise<void> {
    const event: AnalyticsEvent = {
      eventType: 'resource_limits',
      sessionId: this.generateSessionId(),
      timestamp: Date.now(),
      properties: {
        ...usage,
        limits: {
          kvReads: 100000, // Daily limit
          kvWrites: 1000,  // Daily limit
          workerRequests: 100000, // Daily limit
          cdnBandwidth: 'unlimited', // Free tier
          imageTransformations: 100000, // Monthly limit
          aiRequests: 10000, // Daily limit
        },
        utilizationPercent: {
          kvReads: (usage.kvReads / 100000) * 100,
          kvWrites: (usage.kvWrites / 1000) * 100,
          workerRequests: (usage.workerRequests / 100000) * 100,
          imageTransformations: (usage.imageTransformations / 100000) * 100,
          aiRequests: (usage.aiRequests / 10000) * 100,
        },
      },
    };

    await this.sendEvents([event]);
  }

  /**
   * Send error log to Cloudflare Workers
   */
  public async sendErrorLog(errorData: {
    fingerprint: string;
    message: string;
    category?: string;
    severity?: string;
    stack?: string;
    context?: any;
  }): Promise<ErrorLogResponse> {
    try {
      const response = await fetch('/api/errors/log', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(errorData)
      });

      if (!response.ok) {
        throw new Error(`Error logging API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to send error log:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get error metrics from Cloudflare Workers
   */
  public async getErrorMetrics(params: {
    timeWindow?: number;
    category?: string;
    severity?: string;
  }): Promise<AnalyticsResponse> {
    try {
      const searchParams = new URLSearchParams();
      if (params.timeWindow) searchParams.set('timeWindow', params.timeWindow.toString());
      if (params.category) searchParams.set('category', params.category);
      if (params.severity) searchParams.set('severity', params.severity);

      const response = await fetch(`/api/errors/metrics?${searchParams}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        throw new Error(`Error metrics API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to get error metrics:', error);
      return {
        success: false,
        processed: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  /**
   * Get active alerts from Cloudflare Workers
   */
  public async getActiveAlerts(): Promise<AnalyticsResponse> {
    try {
      const response = await fetch('/api/errors/alerts', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        throw new Error(`Alerts API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to get active alerts:', error);
      return {
        success: false,
        processed: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  /**
   * Export error data from Cloudflare Workers
   */
  public async exportErrorData(params: {
    format?: 'json' | 'csv';
    timeWindow?: number;
  }): Promise<string> {
    try {
      const searchParams = new URLSearchParams();
      if (params.format) searchParams.set('format', params.format);
      if (params.timeWindow) searchParams.set('timeWindow', params.timeWindow.toString());

      const response = await fetch(`/api/errors/export?${searchParams}`, {
        method: 'GET'
      });

      if (!response.ok) {
        throw new Error(`Error export API error: ${response.status}`);
      }

      return await response.text();
    } catch (error) {
      console.error('Failed to export error data:', error);
      throw error;
    }
  }

  /**
   * Get site tag for Cloudflare Analytics
   */
  private getSiteTag(): string {
    // In production, this would be configured via environment variables
    return process.env.CLOUDFLARE_SITE_TAG || 'nexus-reader-dev';
  }

  /**
   * Generate session ID
   */
  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Send data with retry logic
   */
  private async sendWithRetry(payload: CloudflareAnalyticsData): Promise<AnalyticsResponse> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        const response = await fetch(this.config.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Analytics-Version': '1.0',
            'X-Session-ID': payload.sessionId,
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result: AnalyticsResponse = await response.json();
        return result;

      } catch (error) {
        lastError = error as Error;
        
        if (attempt < this.config.retryAttempts) {
          await this.delay(this.config.retryDelay * attempt);
        }
      }
    }

    throw lastError || new Error('Failed to send analytics data');
  }

  /**
   * Flush buffered events
   */
  private async flushBuffer(): Promise<void> {
    if (this.isProcessing || this.eventBuffer.length === 0) {
      return;
    }

    this.isProcessing = true;
    const eventsToSend = [...this.eventBuffer];
    this.eventBuffer = [];

    try {
      await this.sendEvents(eventsToSend);
    } catch (error) {
      // Re-buffer events if sending fails
      this.eventBuffer.unshift(...eventsToSend);
      console.warn('Failed to flush analytics buffer:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Start automatic buffer flushing
   */
  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flushBuffer();
    }, this.config.flushInterval);
  }

  /**
   * Stop automatic buffer flushing
   */
  public stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
  }

  /**
   * Delay utility for retry logic
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup resources
   */
  public cleanup(): void {
    this.stopFlushTimer();
    this.flushBuffer(); // Final flush
  }
}

// Export singleton instance
export const analyticsAPI = new AnalyticsAPI();

// Cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    analyticsAPI.cleanup();
  });
}