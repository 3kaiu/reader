/**
 * Production Health Check Script
 * 
 * This script performs comprehensive health checks for all Nexus Reader
 * production services and components.
 */

import fetch from 'node-fetch';
import { performance } from 'perf_hooks';

// Configuration
const CONFIG = {
  baseUrl: process.env.PRODUCTION_BASE_URL || 'https://nexus-reader.com',
  apiUrl: process.env.PRODUCTION_API_URL || 'https://api.nexus-reader.com',
  timeout: 10000, // 10 seconds
  retries: 3,
  expectedResponseTime: 2000, // 2 seconds
  slackWebhook: process.env.SLACK_WEBHOOK_URL,
  emailAlert: process.env.ALERT_EMAIL
};

// Health check results
const results = {
  timestamp: new Date().toISOString(),
  overall: 'unknown',
  checks: [],
  metrics: {
    totalChecks: 0,
    passedChecks: 0,
    failedChecks: 0,
    averageResponseTime: 0,
    totalResponseTime: 0
  }
};

/**
 * Perform HTTP request with timeout and retries
 */
async function makeRequest(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.timeout);
  
  try {
    const startTime = performance.now();
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'Nexus-Reader-Health-Check/1.0',
        ...options.headers
      }
    });
    const endTime = performance.now();
    const responseTime = endTime - startTime;
    
    clearTimeout(timeoutId);
    
    return {
      success: true,
      status: response.status,
      statusText: response.statusText,
      responseTime,
      headers: Object.fromEntries(response.headers.entries()),
      body: response.ok ? await response.text() : null
    };
  } catch (error) {
    clearTimeout(timeoutId);
    return {
      success: false,
      error: error.message,
      responseTime: CONFIG.timeout
    };
  }
}

/**
 * Perform a single health check
 */
async function performCheck(name, url, expectedStatus = 200, validator = null) {
  console.log(`🔍 Checking ${name}...`);
  
  const check = {
    name,
    url,
    status: 'unknown',
    responseTime: 0,
    error: null,
    details: {}
  };
  
  try {
    const result = await makeRequest(url);
    check.responseTime = result.responseTime;
    
    if (!result.success) {
      check.status = 'failed';
      check.error = result.error;
    } else if (result.status !== expectedStatus) {
      check.status = 'failed';
      check.error = `Expected status ${expectedStatus}, got ${result.status}`;
    } else if (validator && !validator(result)) {
      check.status = 'failed';
      check.error = 'Validation failed';
    } else {
      check.status = 'passed';
      check.details = {
        status: result.status,
        responseTime: result.responseTime,
        headers: result.headers
      };
    }
  } catch (error) {
    check.status = 'failed';
    check.error = error.message;
  }
  
  // Update metrics
  results.metrics.totalChecks++;
  results.metrics.totalResponseTime += check.responseTime;
  
  if (check.status === 'passed') {
    results.metrics.passedChecks++;
    console.log(`✅ ${name} - ${check.responseTime.toFixed(0)}ms`);
  } else {
    results.metrics.failedChecks++;
    console.log(`❌ ${name} - ${check.error}`);
  }
  
  results.checks.push(check);
  return check;
}

/**
 * Check main website
 */
async function checkMainWebsite() {
  return await performCheck(
    'Main Website',
    CONFIG.baseUrl,
    200,
    (result) => result.body && result.body.includes('Nexus Reader')
  );
}

/**
 * Check PWA manifest
 */
async function checkPWAManifest() {
  return await performCheck(
    'PWA Manifest',
    `${CONFIG.baseUrl}/manifest.json`,
    200,
    (result) => {
      try {
        const manifest = JSON.parse(result.body);
        return manifest.name && manifest.short_name && manifest.icons;
      } catch {
        return false;
      }
    }
  );
}

/**
 * Check Service Worker
 */
async function checkServiceWorker() {
  return await performCheck(
    'Service Worker',
    `${CONFIG.baseUrl}/sw.js`,
    200,
    (result) => result.body && result.body.includes('self.addEventListener')
  );
}

/**
 * Check API health endpoint
 */
async function checkAPIHealth() {
  return await performCheck(
    'API Health',
    `${CONFIG.apiUrl}/health`,
    200,
    (result) => {
      try {
        const health = JSON.parse(result.body);
        return health.status === 'healthy';
      } catch {
        return false;
      }
    }
  );
}

/**
 * Check API authentication endpoint
 */
async function checkAPIAuth() {
  return await performCheck(
    'API Authentication',
    `${CONFIG.apiUrl}/auth/status`,
    401 // Should return 401 without auth
  );
}

/**
 * Check CDN performance
 */
async function checkCDNPerformance() {
  const check = await performCheck(
    'CDN Performance',
    `${CONFIG.baseUrl}/static/logo.png`,
    200
  );
  
  // Check if response time is acceptable
  if (check.status === 'passed' && check.responseTime > CONFIG.expectedResponseTime) {
    check.status = 'warning';
    check.error = `Response time ${check.responseTime.toFixed(0)}ms exceeds expected ${CONFIG.expectedResponseTime}ms`;
  }
  
  return check;
}

/**
 * Check SSL certificate
 */
async function checkSSLCertificate() {
  const check = await performCheck(
    'SSL Certificate',
    CONFIG.baseUrl,
    200
  );
  
  if (check.status === 'passed') {
    // Check SSL headers
    const headers = check.details.headers;
    if (!headers['strict-transport-security']) {
      check.status = 'warning';
      check.error = 'HSTS header not found';
    }
  }
  
  return check;
}

/**
 * Check DNS resolution
 */
async function checkDNSResolution() {
  const domains = [
    'nexus-reader.com',
    'api.nexus-reader.com',
    'cdn.nexus-reader.com'
  ];
  
  const dnsChecks = await Promise.all(
    domains.map(domain => 
      performCheck(`DNS - ${domain}`, `https://${domain}`, 200)
    )
  );
  
  const failedDNS = dnsChecks.filter(check => check.status === 'failed');
  
  return {
    name: 'DNS Resolution',
    status: failedDNS.length === 0 ? 'passed' : 'failed',
    error: failedDNS.length > 0 ? `${failedDNS.length} DNS checks failed` : null,
    details: { checks: dnsChecks }
  };
}

/**
 * Send alert notification
 */
async function sendAlert(message, severity = 'error') {
  const alerts = [];
  
  // Send Slack notification
  if (CONFIG.slackWebhook) {
    try {
      const slackPayload = {
        text: `🚨 Nexus Reader Health Check Alert`,
        attachments: [{
          color: severity === 'error' ? 'danger' : 'warning',
          fields: [
            {
              title: 'Message',
              value: message,
              short: false
            },
            {
              title: 'Timestamp',
              value: new Date().toISOString(),
              short: true
            },
            {
              title: 'Environment',
              value: 'Production',
              short: true
            }
          ],
          actions: [
            {
              type: 'button',
              text: 'View Dashboard',
              url: 'https://dash.cloudflare.com'
            },
            {
              type: 'button',
              text: 'Check Site',
              url: CONFIG.baseUrl
            }
          ]
        }]
      };
      
      await fetch(CONFIG.slackWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(slackPayload)
      });
      
      alerts.push('Slack notification sent');
    } catch (error) {
      console.error('Failed to send Slack notification:', error.message);
    }
  }
  
  return alerts;
}

/**
 * Generate health report
 */
function generateReport() {
  results.metrics.averageResponseTime = 
    results.metrics.totalResponseTime / results.metrics.totalChecks;
  
  const successRate = (results.metrics.passedChecks / results.metrics.totalChecks) * 100;
  
  if (successRate >= 95) {
    results.overall = 'healthy';
  } else if (successRate >= 80) {
    results.overall = 'degraded';
  } else {
    results.overall = 'unhealthy';
  }
  
  return {
    ...results,
    summary: {
      successRate: successRate.toFixed(1),
      averageResponseTime: results.metrics.averageResponseTime.toFixed(0),
      status: results.overall
    }
  };
}

/**
 * Main health check function
 */
async function runHealthChecks() {
  console.log('🏥 Starting Nexus Reader production health checks...\n');
  
  const startTime = performance.now();
  
  // Run all health checks
  await Promise.all([
    checkMainWebsite(),
    checkPWAManifest(),
    checkServiceWorker(),
    checkAPIHealth(),
    checkAPIAuth(),
    checkCDNPerformance(),
    checkSSLCertificate(),
    checkDNSResolution()
  ]);
  
  const endTime = performance.now();
  const totalTime = endTime - startTime;
  
  // Generate report
  const report = generateReport();
  
  console.log('\n📊 Health Check Summary:');
  console.log(`Overall Status: ${report.overall.toUpperCase()}`);
  console.log(`Success Rate: ${report.summary.successRate}%`);
  console.log(`Average Response Time: ${report.summary.averageResponseTime}ms`);
  console.log(`Total Check Time: ${totalTime.toFixed(0)}ms`);
  console.log(`Checks: ${report.metrics.passedChecks}/${report.metrics.totalChecks} passed`);
  
  // Send alerts if needed
  if (report.overall !== 'healthy') {
    const failedChecks = report.checks.filter(check => check.status === 'failed');
    const message = `Health check failed: ${failedChecks.length} checks failed. Success rate: ${report.summary.successRate}%`;
    await sendAlert(message, report.overall === 'degraded' ? 'warning' : 'error');
  }
  
  // Output JSON report for CI/CD
  if (process.env.CI) {
    console.log('\n📋 JSON Report:');
    console.log(JSON.stringify(report, null, 2));
  }
  
  // Exit with appropriate code
  process.exit(report.overall === 'healthy' ? 0 : 1);
}

// Run health checks if script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runHealthChecks().catch(error => {
    console.error('❌ Health check failed:', error);
    process.exit(1);
  });
}

export { runHealthChecks };