/**
 * Main Vitest Configuration
 * 
 * Configuration for unit tests and property-based tests
 */

import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    // Test environment
    environment: 'node',
    globals: true,
    
    // Include patterns
    include: [
      'src/tests/**/*.test.ts',
      'tests/**/*.test.js'
    ],
    exclude: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'src/tests/integration/**' // Integration tests use separate config
    ],
    
    // Timeouts
    testTimeout: 10000, // 10 seconds per test
    hookTimeout: 10000, // 10 seconds for setup/teardown
    
    // Setup files - include crypto polyfill
    setupFiles: [
      './src/tests/setup/cryptoPolyfill.ts'
    ],
    
    // Coverage settings
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      include: [
        'src/utils/**',
        'src/hooks/**',
        'src/components/**',
        'src/api/**',
        'src/services/**'
      ],
      exclude: [
        'src/tests/**',
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'node_modules/**'
      ]
    },
    
    // Reporter configuration
    reporter: ['verbose'],
    
    // Retry configuration for flaky tests
    retry: 1,
    
    // Pool options
    pool: 'threads',
    poolOptions: {
      threads: {
        maxThreads: 4,
        minThreads: 1
      }
    }
  },
  
  // Resolve configuration
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@tests': resolve(__dirname, './src/tests'),
      '@utils': resolve(__dirname, './src/utils'),
      '@hooks': resolve(__dirname, './src/hooks'),
      '@components': resolve(__dirname, './src/components'),
      '@api': resolve(__dirname, './src/api'),
      '@services': resolve(__dirname, './src/services'),
      '@config': resolve(__dirname, './src/config')
    }
  },
  
  // Define configuration
  define: {
    __TEST_ENV__: '"unit"'
  }
});