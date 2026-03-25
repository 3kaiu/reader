/**
 * Global Setup for Integration Tests
 * 
 * Handles global setup and teardown for the entire integration test suite
 */

import { existsSync, mkdirSync } from 'fs';

const TEST_DIRECTORIES = [
  './test-results',
  './coverage/integration',
  './logs/integration'
] as const;

const TEST_ENV_VARS = {
  NODE_ENV: 'test',
  INTEGRATION_TEST: 'true',
  LOG_LEVEL: 'error',
  CLOUDFLARE_API_URL: 'http://localhost:8787',
  ANALYTICS_API_URL: 'http://localhost:3000/analytics',
  AI_API_URL: 'http://localhost:3000/ai',
  TEST_TIMEOUT: '60000',
  SETUP_TIMEOUT: '30000'
} as const;

export async function setup() {
  console.log('🚀 Starting global integration test setup...');

  try {
    // Create necessary directories
    TEST_DIRECTORIES.forEach(dir => {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
        console.log(`📁 Created directory: ${dir}`);
      }
    });

    // Set environment variables for integration tests
    Object.entries(TEST_ENV_VARS).forEach(([key, value]) => {
      process.env[key] = value;
    });

    console.log('✅ Global integration test setup completed');

  } catch (error: unknown) {
    console.error('❌ Global integration test setup failed:', error);
    throw error;
  }
}

export async function teardown() {
  console.log('🧹 Starting global integration test teardown...');

  try {
    // Clean up any remaining processes or resources
    // This is where you'd stop any test servers, clean up databases, etc.
    
    // Reset environment variables
    Object.keys(TEST_ENV_VARS).forEach(key => {
      delete process.env[key];
    });

    console.log('✅ Global integration test teardown completed');

  } catch (error: unknown) {
    console.error('❌ Global integration test teardown failed:', error);
    // Don't throw here to avoid masking test failures
  }
}
