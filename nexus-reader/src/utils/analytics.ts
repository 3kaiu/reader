/**
 * Analytics Tracking System
 * Integrates with Cloudflare Analytics and provides custom event tracking
 * Validates Requirement 7.1: Analytics tracking for performance metrics
 */

export interface AnalyticsEvent {
  eventType: string;
  userId?: string;
  sessionId: string;
  timestamp: number;
  properties: Record<string, any>;
  performance?: PerformanceMetrics;
}

export interface PerformanceMetrics {
  loadTime: number;
  renderTime: number;
  cacheHitRate: number;
  errorRate: number;
  memoryUsage?: number;
  networkLatency?: number;
}

export interface UserInteractionEvent {
  action: 'page_view' | 'novel_open' | 'chapter_read' | 'search' | 'bookmark' | 'sync';
  target?: string;
  value?: number;
  metadata?: Record<string, any>;
}

class AnalyticsManager {
  private sessionId: string;
  private userId?: string;
  private eventQueue: AnalyticsEvent[] = [];
  private isOnline: boolean;
  private performanceObserver?: PerformanceObserver;

  constructor() {
    this.sessionId = this.generateSessionId();
    this.isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    
    if (typeof window !== 'undefined') {
      this.initializePerformanceTracking();
      this.setupNetworkStatusTracking();
      this.setupBeforeUnloadHandler();
    }
  }

  /**
   * Initialize the analytics system with user context
   */
  public initialize(userId?: string): void {
    this.userId = userId;
    
    if (typeof window !== 'undefined') {
      this.trackEvent('session_start', {
        userAgent: navigator.userAgent,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        language: navigator.language,
      });
    }
  }

  /**
   * Track a custom event with optional performance metrics
   */
  public trackEvent(eventType: string, properties: Record<string, any> = {}): void {
    const event: AnalyticsEvent = {
      eventType,
      userId: this.userId,
      sessionId: this.sessionId,
      timestamp: Date.now(),
      properties,
      performance: this.getCurrentPerformanceMetrics(),
    };

    this.eventQueue.push(event);
    
    // In test environment, immediately process events
    if (typeof window === 'undefined' || process.env.NODE_ENV === 'test') {
      this.processEventQueue();
    } else {
      // In browser, use timeout to batch events
      setTimeout(() => this.processEventQueue(), 100);
    }
  }

  /**
   * Track user interaction events
   */
  public trackUserInteraction(interaction: UserInteractionEvent): void {
    this.trackEvent('user_interaction', {
      action: interaction.action,
      target: interaction.target,
      value: interaction.value,
      metadata: interaction.metadata,
    });
  }

  /**
   * Track page view with performance metrics
   */
  public trackPageView(page: string, referrer?: string): void {
    if (typeof window === 'undefined') {
      // In test environment, still track the event
      this.trackEvent('page_view', {
        page,
        referrer: referrer || '',
        loadTime: 0,
        domContentLoaded: 0,
        firstContentfulPaint: 0,
      });
      return;
    }
    
    const performanceEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    
    this.trackEvent('page_view', {
      page,
      referrer: referrer || document.referrer,
      loadTime: performanceEntry?.loadEventEnd - performanceEntry?.loadEventStart,
      domContentLoaded: performanceEntry?.domContentLoadedEventEnd - performanceEntry?.domContentLoadedEventStart,
      firstContentfulPaint: this.getFirstContentfulPaint(),
    });
  }

  /**
   * Track error events with context
   */
  public trackError(error: Error, context?: Record<string, any>): void {
    this.trackEvent('error', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      context,
      url: window.location.href,
      userAgent: navigator.userAgent,
    });
  }

  /**
   * Track performance metrics
   */
  public trackPerformance(metrics: Partial<PerformanceMetrics>): void {
    this.trackEvent('performance', metrics);
  }

  /**
   * Track resource usage and limits
   */
  public trackResourceUsage(): void {
    if (typeof window === 'undefined') {
      // In test environment, still track with mock data
      this.trackEvent('resource_usage', {
        memoryUsed: (performance as any).memory?.usedJSHeapSize || 0,
        memoryTotal: (performance as any).memory?.totalJSHeapSize || 0,
        memoryLimit: (performance as any).memory?.jsHeapSizeLimit || 0,
        storageUsed: 0,
        storageQuota: 0,
        storageUsagePercent: 0,
      });
      return;
    }
    
    const memoryInfo = (performance as any).memory;
    const storageEstimate = navigator.storage?.estimate();

    Promise.resolve(storageEstimate).then((estimate) => {
      this.trackEvent('resource_usage', {
        memoryUsed: memoryInfo?.usedJSHeapSize,
        memoryTotal: memoryInfo?.totalJSHeapSize,
        memoryLimit: memoryInfo?.jsHeapSizeLimit,
        storageUsed: estimate?.usage,
        storageQuota: estimate?.quota,
        storageUsagePercent: estimate?.usage && estimate?.quota 
          ? (estimate.usage / estimate.quota) * 100 
          : undefined,
      });
    });
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Initialize performance tracking
   */
  private initializePerformanceTracking(): void {
    if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return;
    
    this.performanceObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === 'measure') {
          this.trackEvent('performance_measure', {
            name: entry.name,
            duration: entry.duration,
            startTime: entry.startTime,
          });
        }
      }
    });

    this.performanceObserver.observe({ entryTypes: ['measure', 'navigation'] });
  }

  /**
   * Setup network status tracking
   */
  private setupNetworkStatusTracking(): void {
    if (typeof window === 'undefined') return;
    
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.trackEvent('network_status', { status: 'online' });
      this.processEventQueue();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.trackEvent('network_status', { status: 'offline' });
    });
  }

  /**
   * Setup beforeunload handler to flush events
   */
  private setupBeforeUnloadHandler(): void {
    if (typeof window === 'undefined') return;
    
    window.addEventListener('beforeunload', () => {
      this.trackEvent('session_end', {
        duration: Date.now() - parseInt(this.sessionId.split('-')[0]),
        eventsTracked: this.eventQueue.length,
      });
      this.flushEvents();
    });
  }

  /**
   * Get current performance metrics
   */
  private getCurrentPerformanceMetrics(): PerformanceMetrics | undefined {
    if (typeof window === 'undefined') return undefined;
    
    const memoryInfo = (performance as any).memory;
    const connection = (navigator as any).connection;

    return {
      loadTime: performance.now(),
      renderTime: this.getFirstContentfulPaint() || 0,
      cacheHitRate: this.calculateCacheHitRate(),
      errorRate: 0, // Will be calculated based on error events
      memoryUsage: memoryInfo?.usedJSHeapSize,
      networkLatency: connection?.rtt,
    };
  }

  /**
   * Get First Contentful Paint timing
   */
  private getFirstContentfulPaint(): number | undefined {
    if (typeof window === 'undefined') return undefined;
    
    const paintEntries = performance.getEntriesByType('paint');
    const fcpEntry = paintEntries.find(entry => entry.name === 'first-contentful-paint');
    return fcpEntry?.startTime;
  }

  /**
   * Calculate cache hit rate based on resource timing
   */
  private calculateCacheHitRate(): number {
    if (typeof window === 'undefined') return 0;
    
    const resourceEntries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    if (resourceEntries.length === 0) return 0;

    const cachedResources = resourceEntries.filter(entry => 
      entry.transferSize === 0 || entry.transferSize < entry.encodedBodySize
    );

    return (cachedResources.length / resourceEntries.length) * 100;
  }

  /**
   * Process event queue and send to analytics endpoint
   */
  private async processEventQueue(): Promise<void> {
    if (!this.isOnline || this.eventQueue.length === 0) return;

    const eventsToSend = [...this.eventQueue];
    this.eventQueue = [];

    try {
      await this.sendEvents(eventsToSend);
    } catch (error) {
      // Re-queue events if sending fails
      this.eventQueue.unshift(...eventsToSend);
      console.warn('Failed to send analytics events:', error);
    }
  }

  /**
   * Send events to analytics endpoint
   */
  private async sendEvents(events: AnalyticsEvent[]): Promise<void> {
    // In test environment, immediately process events
    if (typeof window === 'undefined' || process.env.NODE_ENV === 'test') {
      // Simulate API call for testing
      const response = await fetch('/api/analytics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ events }),
      });

      if (!response.ok) {
        throw new Error(`Analytics API error: ${response.status}`);
      }
      return;
    }

    const response = await fetch('/api/analytics', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ events }),
    });

    if (!response.ok) {
      throw new Error(`Analytics API error: ${response.status}`);
    }
  }

  /**
   * Flush all pending events (used on page unload)
   */
  private flushEvents(): void {
    if (this.eventQueue.length === 0 || typeof navigator === 'undefined') return;

    // Use sendBeacon for reliable delivery on page unload
    if ('sendBeacon' in navigator) {
      navigator.sendBeacon('/api/analytics', JSON.stringify({ 
        events: this.eventQueue 
      }));
    }
  }
}

// Global analytics instance
export const analytics = new AnalyticsManager();

// Auto-initialize on module load
if (typeof window !== 'undefined') {
  // Track initial page load
  window.addEventListener('load', () => {
    analytics.trackPageView(window.location.pathname);
    analytics.trackResourceUsage();
  });

  // Track errors globally
  window.addEventListener('error', (event) => {
    analytics.trackError(new Error(event.message), {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  // Track unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    analytics.trackError(new Error(event.reason), {
      type: 'unhandled_promise_rejection',
    });
  });
}