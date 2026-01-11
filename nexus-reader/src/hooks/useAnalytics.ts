/**
 * Analytics Hook
 * React hook for analytics tracking integration
 * Validates Requirement 7.1: Custom event tracking
 */

import { useEffect, useCallback, useRef } from 'react';
import { analytics, AnalyticsEvent, UserInteractionEvent } from '../utils/analytics';

export interface UseAnalyticsOptions {
  userId?: string;
  autoTrackPageViews?: boolean;
  autoTrackPerformance?: boolean;
  trackResourceUsage?: boolean;
}

export interface AnalyticsHookReturn {
  trackEvent: (eventType: string, properties?: Record<string, any>) => void;
  trackUserInteraction: (interaction: UserInteractionEvent) => void;
  trackPageView: (page?: string, referrer?: string) => void;
  trackError: (error: Error, context?: Record<string, any>) => void;
  trackPerformance: () => void;
  trackResourceUsage: () => void;
  isInitialized: boolean;
}

export function useAnalytics(options: UseAnalyticsOptions = {}): AnalyticsHookReturn {
  const {
    userId,
    autoTrackPageViews = true,
    autoTrackPerformance = true,
    trackResourceUsage = true,
  } = options;

  const isInitialized = useRef(false);
  const performanceTimer = useRef<NodeJS.Timeout>();
  const resourceTimer = useRef<NodeJS.Timeout>();

  // Initialize analytics
  useEffect(() => {
    if (!isInitialized.current) {
      analytics.initialize(userId);
      isInitialized.current = true;
    }
  }, [userId]);

  // Auto-track page views
  useEffect(() => {
    if (!autoTrackPageViews) return;

    const handleLocationChange = () => {
      analytics.trackPageView(window.location.pathname, document.referrer);
    };

    // Track initial page view
    handleLocationChange();

    // Listen for navigation changes (for SPAs)
    window.addEventListener('popstate', handleLocationChange);
    
    // For React Router or similar, you might need to listen to history changes
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function(...args) {
      originalPushState.apply(history, args);
      setTimeout(handleLocationChange, 0);
    };

    history.replaceState = function(...args) {
      originalReplaceState.apply(history, args);
      setTimeout(handleLocationChange, 0);
    };

    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
    };
  }, [autoTrackPageViews]);

  // Auto-track performance metrics
  useEffect(() => {
    if (!autoTrackPerformance) return;

    const trackPerformanceMetrics = () => {
      analytics.trackResourceUsage();
      
      // Track Web Vitals
      if ('PerformanceObserver' in window) {
        // Largest Contentful Paint
        const lcpObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            analytics.trackEvent('web_vital_lcp', {
              value: entry.startTime,
              rating: entry.startTime < 2500 ? 'good' : entry.startTime < 4000 ? 'needs-improvement' : 'poor',
            });
          }
        });
        lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });

        // First Input Delay
        const fidObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            analytics.trackEvent('web_vital_fid', {
              value: entry.processingStart - entry.startTime,
              rating: (entry.processingStart - entry.startTime) < 100 ? 'good' : 
                     (entry.processingStart - entry.startTime) < 300 ? 'needs-improvement' : 'poor',
            });
          }
        });
        fidObserver.observe({ entryTypes: ['first-input'] });

        // Cumulative Layout Shift
        let clsValue = 0;
        const clsObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!entry.hadRecentInput) {
              clsValue += entry.value;
            }
          }
          
          analytics.trackEvent('web_vital_cls', {
            value: clsValue,
            rating: clsValue < 0.1 ? 'good' : clsValue < 0.25 ? 'needs-improvement' : 'poor',
          });
        });
        clsObserver.observe({ entryTypes: ['layout-shift'] });
      }
    };

    // Track performance every 30 seconds
    performanceTimer.current = setInterval(trackPerformanceMetrics, 30000);
    
    // Initial performance tracking
    setTimeout(trackPerformanceMetrics, 1000);

    return () => {
      if (performanceTimer.current) {
        clearInterval(performanceTimer.current);
      }
    };
  }, [autoTrackPerformance]);

  // Auto-track resource usage
  useEffect(() => {
    if (!trackResourceUsage) return;

    const trackResources = () => {
      analytics.trackResourceUsage();
    };

    // Track resource usage every 60 seconds
    resourceTimer.current = setInterval(trackResources, 60000);

    return () => {
      if (resourceTimer.current) {
        clearInterval(resourceTimer.current);
      }
    };
  }, [trackResourceUsage]);

  // Memoized tracking functions
  const trackEvent = useCallback((eventType: string, properties: Record<string, any> = {}) => {
    analytics.trackEvent(eventType, properties);
  }, []);

  const trackUserInteraction = useCallback((interaction: UserInteractionEvent) => {
    analytics.trackUserInteraction(interaction);
  }, []);

  const trackPageView = useCallback((page?: string, referrer?: string) => {
    analytics.trackPageView(page || window.location.pathname, referrer);
  }, []);

  const trackError = useCallback((error: Error, context?: Record<string, any>) => {
    analytics.trackError(error, context);
  }, []);

  const trackPerformance = useCallback(() => {
    analytics.trackResourceUsage();
  }, []);

  const trackResourceUsageCallback = useCallback(() => {
    analytics.trackResourceUsage();
  }, []);

  return {
    trackEvent,
    trackUserInteraction,
    trackPageView,
    trackError,
    trackPerformance,
    trackResourceUsage: trackResourceUsageCallback,
    isInitialized: isInitialized.current,
  };
}

// Higher-order component for automatic analytics tracking
export function withAnalytics<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  options: UseAnalyticsOptions = {}
) {
  return function AnalyticsWrapper(props: P & { analytics?: AnalyticsHookReturn }) {
    const analytics = useAnalytics(options);

    // Track component mount
    useEffect(() => {
      analytics.trackEvent('component_mount', {
        componentName: WrappedComponent.displayName || WrappedComponent.name,
      });

      return () => {
        analytics.trackEvent('component_unmount', {
          componentName: WrappedComponent.displayName || WrappedComponent.name,
        });
      };
    }, [analytics]);

    return React.createElement(WrappedComponent, { ...props, analytics });
  };
}

// Hook for tracking specific user actions
export function useActionTracking() {
  const { trackUserInteraction } = useAnalytics();

  const trackNovelOpen = useCallback((novelId: string, title: string) => {
    trackUserInteraction({
      action: 'novel_open',
      target: novelId,
      metadata: { title },
    });
  }, [trackUserInteraction]);

  const trackChapterRead = useCallback((chapterId: string, progress: number) => {
    trackUserInteraction({
      action: 'chapter_read',
      target: chapterId,
      value: progress,
    });
  }, [trackUserInteraction]);

  const trackSearch = useCallback((query: string, resultsCount: number) => {
    trackUserInteraction({
      action: 'search',
      target: query,
      value: resultsCount,
    });
  }, [trackUserInteraction]);

  const trackBookmark = useCallback((novelId: string, chapterId: string) => {
    trackUserInteraction({
      action: 'bookmark',
      target: novelId,
      metadata: { chapterId },
    });
  }, [trackUserInteraction]);

  const trackSync = useCallback((syncType: string, itemCount: number) => {
    trackUserInteraction({
      action: 'sync',
      target: syncType,
      value: itemCount,
    });
  }, [trackUserInteraction]);

  return {
    trackNovelOpen,
    trackChapterRead,
    trackSearch,
    trackBookmark,
    trackSync,
  };
}