/**
 * Property-Based Tests for Analytics Tracking
 * Feature: free-tier-maximization, Property 18: Analytics tracking
 * Validates Requirement 7.1: Performance metrics collection and tracking
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock navigator and performance APIs
Object.defineProperty(global, 'navigator', {
  value: {
    onLine: true,
    userAgent: 'test-agent',
    language: 'en-US',
    sendBeacon: vi.fn(),
  },
  writable: true,
});

Object.defineProperty(global, 'performance', {
  value: {
    now: vi.fn(() => 1000),
    getEntriesByType: vi.fn(() => []),
    memory: {
      usedJSHeapSize: 1024 * 1024,
      totalJSHeapSize: 2 * 1024 * 1024,
      jsHeapSizeLimit: 4 * 1024 * 1024,
    },
  },
  writable: true,
});

Object.defineProperty(global, 'PerformanceObserver', {
  value: class MockPerformanceObserver {
    constructor(callback) {
      this.callback = callback;
    }
    observe() {}
    disconnect() {}
  },
  writable: true,
});

// Mock document
Object.defineProperty(global, 'document', {
  value: {
    referrer: 'https://example.com',
    createElement: vi.fn().mockReturnValue({
      src: '',
      onload: null,
      onerror: null
    }),
    head: {
      appendChild: vi.fn(),
      removeChild: vi.fn()
    }
  },
  writable: true,
});

// Mock Intl
Object.defineProperty(global, 'Intl', {
  value: {
    DateTimeFormat: () => ({
      resolvedOptions: () => ({ timeZone: 'UTC' }),
    }),
  },
  writable: true,
});

// Set test environment
process.env.NODE_ENV = 'test';

describe('Analytics Tracking Properties', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, processed: 1 }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Property 18: Analytics Tracking
   * For any user access to the application, the system should track performance metrics
   */
  it('Property 18: should track analytics events for any user interaction', async () => {
    // Import analytics after mocks are set up
    const { analytics } = await import('../utils/analytics');
    
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          eventType: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          properties: fc.dictionary(fc.string(), fc.oneof(fc.string(), fc.integer(), fc.boolean())),
          userId: fc.option(fc.string()),
        }),
        async (eventData) => {
          // Clear previous calls
          mockFetch.mockClear();
          
          // Initialize analytics with user context
          analytics.initialize(eventData.userId);

          // Track the event
          analytics.trackEvent(eventData.eventType, eventData.properties);

          // Wait for async processing
          await new Promise(resolve => setTimeout(resolve, 10));

          // Verify event was processed
          expect(mockFetch).toHaveBeenCalled();
          
          const fetchCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
          const [url, options] = fetchCall;
          
          expect(url).toBe('/api/analytics');
          expect(options.method).toBe('POST');
          expect(options.headers['Content-Type']).toBe('application/json');
          
          const payload = JSON.parse(options.body);
          expect(payload.events).toBeDefined();
          expect(Array.isArray(payload.events)).toBe(true);
          
          const event = payload.events.find(e => e.eventType === eventData.eventType);
          expect(event).toBeDefined();
          expect(event.properties).toEqual(eventData.properties);
          expect(event.timestamp).toBeTypeOf('number');
          expect(event.sessionId).toBeTypeOf('string');
        }
      ),
      { numRuns: 20 }
    );
  });

  it('Property 18: should collect performance metrics for page loads', async () => {
    const { analytics } = await import('../utils/analytics');
    
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          page: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
          loadTime: fc.integer({ min: 100, max: 10000 }),
          renderTime: fc.integer({ min: 50, max: 5000 }),
        }),
        async (pageData) => {
          // Clear previous calls
          mockFetch.mockClear();
          
          // Mock performance timing
          vi.spyOn(performance, 'getEntriesByType').mockReturnValue([
            {
              loadEventEnd: pageData.loadTime,
              loadEventStart: 0,
              domContentLoadedEventEnd: pageData.renderTime,
              domContentLoadedEventStart: 0,
            } as PerformanceNavigationTiming,
          ]);

          // Track page view
          analytics.trackPageView(pageData.page);

          // Wait for async processing
          await new Promise(resolve => setTimeout(resolve, 10));

          // Verify performance metrics were collected
          expect(mockFetch).toHaveBeenCalled();
          
          const fetchCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
          const payload = JSON.parse(fetchCall[1].body);
          
          const pageViewEvent = payload.events.find(e => e.eventType === 'page_view');
          expect(pageViewEvent).toBeDefined();
          expect(pageViewEvent.properties.page).toBe(pageData.page);
        }
      ),
      { numRuns: 10 }
    );
  });

  it('Property 18: should track resource usage metrics', async () => {
    const { analytics } = await import('../utils/analytics');
    
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          memoryUsed: fc.integer({ min: 1024, max: 100 * 1024 * 1024 }),
        }),
        async (resourceData) => {
          // Clear previous calls
          mockFetch.mockClear();
          
          // Mock memory APIs
          (performance as any).memory.usedJSHeapSize = resourceData.memoryUsed;

          // Track resource usage
          analytics.trackResourceUsage();

          // Wait for async processing
          await new Promise(resolve => setTimeout(resolve, 10));

          // Verify resource metrics were tracked
          expect(mockFetch).toHaveBeenCalled();
          
          const fetchCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
          const payload = JSON.parse(fetchCall[1].body);
          
          const resourceEvent = payload.events.find(e => e.eventType === 'resource_usage');
          expect(resourceEvent).toBeDefined();
          expect(resourceEvent.properties.memoryUsed).toBe(resourceData.memoryUsed);
        }
      ),
      { numRuns: 10 }
    );
  });

  it('Property 18: should handle analytics errors gracefully', async () => {
    const { analytics } = await import('../utils/analytics');
    
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          eventType: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          shouldFail: fc.boolean(),
        }),
        async (testData) => {
          // Clear previous calls
          mockFetch.mockClear();
          
          // Configure fetch to fail if requested
          if (testData.shouldFail) {
            mockFetch.mockRejectedValueOnce(new Error('Test error'));
          } else {
            mockFetch.mockResolvedValueOnce({
              ok: true,
              json: () => Promise.resolve({ success: true, processed: 1 }),
            });
          }

          // Track event - should not throw
          expect(() => {
            analytics.trackEvent(testData.eventType, { test: true });
          }).not.toThrow();

          // Wait for async processing
          await new Promise(resolve => setTimeout(resolve, 10));

          // System should continue functioning regardless of analytics failures
          expect(() => {
            analytics.trackEvent('follow_up_event', { after_error: true });
          }).not.toThrow();
        }
      ),
      { numRuns: 10 }
    );
  });

  it('Property 18: should batch analytics events efficiently', async () => {
    const { analytics } = await import('../utils/analytics');
    
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            eventType: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
            properties: fc.dictionary(fc.string(), fc.string()),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (events) => {
          // Clear previous calls
          mockFetch.mockClear();
          
          // Track multiple events rapidly
          events.forEach(event => {
            analytics.trackEvent(event.eventType, event.properties);
          });

          // Wait for async processing
          await new Promise(resolve => setTimeout(resolve, 20));

          // Verify events were processed
          expect(mockFetch).toHaveBeenCalled();
          
          const fetchCalls = mockFetch.mock.calls;
          const totalEventsSent = fetchCalls.reduce((total, call) => {
            const payload = JSON.parse(call[1].body);
            return total + payload.events.length;
          }, 0);

          // All events should be sent
          expect(totalEventsSent).toBeGreaterThanOrEqual(events.length);

          // Verify each event was properly formatted
          fetchCalls.forEach(call => {
            const payload = JSON.parse(call[1].body);
            payload.events.forEach(event => {
              expect(event.eventType).toBeTypeOf('string');
              expect(event.timestamp).toBeTypeOf('number');
              expect(event.sessionId).toBeTypeOf('string');
              expect(event.properties).toBeTypeOf('object');
            });
          });
        }
      ),
      { numRuns: 10 }
    );
  });

  it('Property 18: should maintain session consistency across events', async () => {
    const { analytics } = await import('../utils/analytics');
    
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
          { minLength: 2, maxLength: 3 }
        ),
        async (eventTypes) => {
          // Clear previous calls
          mockFetch.mockClear();
          
          // Initialize analytics
          analytics.initialize('test-user');

          // Track multiple events in the same session
          eventTypes.forEach(eventType => {
            analytics.trackEvent(eventType, { test: true });
          });

          // Wait for async processing
          await new Promise(resolve => setTimeout(resolve, 20));

          // Verify all events have the same session ID
          const fetchCalls = mockFetch.mock.calls;
          const sessionIds = new Set();

          fetchCalls.forEach(call => {
            const payload = JSON.parse(call[1].body);
            payload.events.forEach(event => {
              sessionIds.add(event.sessionId);
            });
          });

          // All events should share the same session ID
          expect(sessionIds.size).toBe(1);
        }
      ),
      { numRuns: 10 }
    );
  });

  it('Property 18: should track API analytics metrics correctly', async () => {
    const { analyticsAPI } = await import('../api/analytics');
    
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          kvReads: fc.integer({ min: 1, max: 100000 }),
          kvWrites: fc.integer({ min: 1, max: 1000 }),
          workerRequests: fc.integer({ min: 1, max: 100000 }),
          cdnBandwidth: fc.integer({ min: 1, max: 1000000 }),
          imageTransformations: fc.integer({ min: 1, max: 100000 }),
          aiRequests: fc.integer({ min: 1, max: 10000 }),
        }),
        async (usage) => {
          // Clear previous calls
          mockFetch.mockClear();
          
          // Track resource limits
          await analyticsAPI.trackResourceLimits(usage);

          // Wait for async processing
          await new Promise(resolve => setTimeout(resolve, 10));

          // Verify the tracking call was made
          expect(mockFetch).toHaveBeenCalled();
          
          const fetchCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
          const payload = JSON.parse(fetchCall[1].body);
          
          const resourceEvent = payload.events.find(e => e.eventType === 'resource_limits');
          expect(resourceEvent).toBeDefined();
          expect(resourceEvent.properties.kvReads).toBe(usage.kvReads);
          expect(resourceEvent.properties.kvWrites).toBe(usage.kvWrites);
          expect(resourceEvent.properties.workerRequests).toBe(usage.workerRequests);
          
          // Verify utilization percentages are calculated correctly
          expect(resourceEvent.properties.utilizationPercent.kvReads).toBeCloseTo((usage.kvReads / 100000) * 100, 2);
          expect(resourceEvent.properties.utilizationPercent.kvWrites).toBeCloseTo((usage.kvWrites / 1000) * 100, 2);
          expect(resourceEvent.properties.utilizationPercent.workerRequests).toBeCloseTo((usage.workerRequests / 100000) * 100, 2);
        }
      ),
      { numRuns: 10 }
    );
  });
});