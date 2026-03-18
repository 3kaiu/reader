/**
 * Integration Test Setup
 * 
 * Global setup configuration for integration tests
 */

import { vi, beforeAll, afterAll } from 'vitest';

// Global mocks and polyfills
beforeAll(() => {
  // Mock global objects that might not be available in Node.js environment
  Object.defineProperty(globalThis, 'window', {
    value: {
      localStorage: {
        getItem: vi.fn(),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
        key: vi.fn(),
        length: 0
      },
      sessionStorage: {
        getItem: vi.fn(),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
        key: vi.fn(),
        length: 0
      },
      location: {
        href: 'http://localhost:3000',
        origin: 'http://localhost:3000',
        protocol: 'http:',
        host: 'localhost:3000',
        hostname: 'localhost',
        port: '3000',
        pathname: '/',
        search: '',
        hash: ''
      },
      navigator: {
        userAgent: 'Mozilla/5.0 (Test Environment)',
        language: 'en-US',
        languages: ['en-US', 'en'],
        onLine: true,
        cookieEnabled: true
      },
      document: {
        createElement: vi.fn(),
        getElementById: vi.fn(),
        querySelector: vi.fn(),
        querySelectorAll: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        title: 'Test Environment',
        body: {},
        head: {}
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      fetch: vi.fn(),
      Request: vi.fn(),
      Response: vi.fn(),
      Headers: vi.fn(),
      URL: vi.fn(),
      URLSearchParams: vi.fn(),
      WebSocket: vi.fn(),
      Worker: vi.fn(),
      ServiceWorker: vi.fn(),
      performance: {
        now: () => Date.now(),
        mark: vi.fn(),
        measure: vi.fn(),
        getEntriesByType: vi.fn(() => []),
        getEntriesByName: vi.fn(() => [])
      },
      requestAnimationFrame: vi.fn((cb) => setTimeout(cb, 16)),
      cancelAnimationFrame: vi.fn(),
      setTimeout: vi.fn((cb, delay) => setTimeout(cb, delay)),
      loadHeavyModule: vi.fn().mockImplementation(async (_name, _loader) => { /* mock implementation */ }),
      clearTimeout: vi.fn(),
      setInterval: vi.fn((cb, delay) => setInterval(cb, delay)),
      clearInterval: vi.fn()
    },
    writable: true,
    configurable: true
  });

  // Mock global fetch if not available
  if (!globalThis.fetch) {
    globalThis.fetch = vi.fn();
  }

  // Mock console methods for cleaner test output
  const originalConsole = { ...console };
  console.log = vi.fn();
  console.info = vi.fn();
  console.warn = vi.fn();
  console.error = vi.fn();
  console.debug = vi.fn();

  // Restore console for important messages
  // @ts-ignore
  globalThis.__originalConsole = originalConsole;
});

afterAll(() => {
  // Restore original console
  // @ts-ignore
  if (globalThis.__originalConsole) {
    // @ts-ignore
    Object.assign(console, globalThis.__originalConsole);
  }
});