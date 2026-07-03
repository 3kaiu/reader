/**
 * Vitest Configuration for Integration Tests
 * 
 * Specialized configuration for running comprehensive integration tests
 * with performance monitoring and load testing capabilities.
 */

import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    // Integration test specific settings
    name: 'integration',
    include: ['src/tests/integration/**/*.test.ts'],
    exclude: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'src/tests/unit/**',
      'src/tests/properties/**'
    ],
    
    // Environment setup
    environment: 'node',
    globals: true,
    
    // Timeouts for integration tests (longer than unit tests)
    testTimeout: 60000, // 1 minute per test
    hookTimeout: 30000, // 30 seconds for setup/teardown
    
    // Concurrency settings
    threads: false, // Disable threading for integration tests to avoid conflicts
    maxConcurrency: 1, // Run integration tests sequentially
    
    // Coverage settings — thresholds disabled until integration tests exist
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage/integration',
      include: [
        'src/utils/**',
        'src/components/**',
        'src/api/**',
        'src/services/**'
      ],
      exclude: [
        'src/tests/**',
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'node_modules/**'
      ],
      // TODO: re-enable when integration test suite is populated
      // thresholds: { lines: 70, branches: 70, functions: 70, statements: 70 }
    },
    
    // Reporter configuration
    reporter: [
      'verbose',
      'json',
      ['html', { outputFile: './test-results/integration-report.html' }],
      ['junit', { outputFile: './test-results/integration-junit.xml' }]
    ],
    
    // Setup files
    setupFiles: [
      './src/tests/integration/setup.ts'
    ],
    
    // Global test configuration
    globalSetup: './src/tests/integration/globalSetup.ts',
    
    // Performance monitoring
    benchmark: {
      include: ['src/tests/integration/**/*.bench.ts'],
      reporter: ['verbose', 'json']
    },
    
    // Retry configuration for flaky integration tests
    retry: 2,
    
    // Worker pool settings
    pool: 'forks',
    maxWorkers: 1,
    minWorkers: 1
  },
  
  // Resolve configuration
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@tests': resolve(__dirname, './src/tests'),
      '@integration': resolve(__dirname, './src/tests/integration')
    }
  },
  
  // Define configuration
  define: {
    __INTEGRATION_TEST__: true,
    __TEST_ENV__: '"integration"'
  }
});
