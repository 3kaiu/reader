/**
 * Global Setup for Integration Tests
 * 
 * Handles global setup and teardown for the entire integration test suite
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';

export async function setup() {
  console.log('🚀 Starting global integration test setup...');

  try {
    // Create necessary directories
    const dirs = [
      './test-results',
      './coverage/integration',
      './logs/integration'
    ];

    dirs.forEach(dir => {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
        console.log(`📁 Created directory: ${dir}`);
      }
    });

    // Set environment variables for integration tests
    process.env.NODE_ENV = 'test';
    process.env.INTEGRATION_TEST = 'true';
    process.env.LOG_LEVEL = 'error'; // Reduce log noise during tests
    
    // Mock external service endpoints
    process.env.CLOUDFLARE_API_URL = 'http://localhost:8787';
    process.env.ANALYTICS_API_URL = 'http://localhost:3000/analytics';
    process.env.AI_API_URL = 'http://localhost:3000/ai';
    
    // Set test timeouts
    process.env.TEST_TIMEOUT = '60000';
    process.env.SETUP_TIMEOUT = '30000';

    console.log('✅ Global integration test setup completed');

  } catch (error) {
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
    delete process.env.INTEGRATION_TEST;
    delete process.env.CLOUDFLARE_API_URL;
    delete process.env.ANALYTICS_API_URL;
    delete process.env.AI_API_URL;

    console.log('✅ Global integration test teardown completed');

  } catch (error) {
    console.error('❌ Global integration test teardown failed:', error);
    // Don't throw here to avoid masking test failures
  }
}