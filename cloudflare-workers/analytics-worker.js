/**
 * Cloudflare Workers Analytics Processor
 * Handles analytics data collection and forwards to Cloudflare Analytics
 * Validates Requirement 7.1: Analytics tracking integration
 */

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return handleCORS();
    }

    // Only accept POST requests for analytics data
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      const analyticsData = await request.json();
      
      // Validate the analytics payload
      if (!validateAnalyticsPayload(analyticsData)) {
        return new Response('Invalid analytics payload', { status: 400 });
      }

      // Process analytics events
      const result = await processAnalyticsEvents(analyticsData, env);
      
      // Return success response with CORS headers
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...getCORSHeaders(),
        },
      });

    } catch (error) {
      console.error('Analytics processing error:', error);
      
      return new Response(JSON.stringify({
        success: false,
        error: 'Internal server error',
        message: error.message,
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...getCORSHeaders(),
        },
      });
    }
  },
};

/**
 * Validate analytics payload structure
 */
function validateAnalyticsPayload(data) {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const { siteTag, events, timestamp, sessionId } = data;

  if (!siteTag || !Array.isArray(events) || !timestamp || !sessionId) {
    return false;
  }

  // Validate each event
  for (const event of events) {
    if (!event.eventType || !event.sessionId || !event.timestamp) {
      return false;
    }
  }

  return true;
}

/**
 * Process analytics events and store/forward them
 */
async function processAnalyticsEvents(analyticsData, env) {
  const { siteTag, events, sessionId } = analyticsData;
  const processedEvents = [];
  const errors = [];

  for (const event of events) {
    try {
      // Enrich event with additional metadata
      const enrichedEvent = await enrichEvent(event, env);
      
      // Store event in KV for later analysis
      await storeEventInKV(enrichedEvent, env);
      
      // Forward to Cloudflare Analytics if configured
      if (env.CLOUDFLARE_ANALYTICS_TOKEN) {
        await forwardToCloudflareAnalytics(enrichedEvent, siteTag, env);
      }
      
      // Track resource usage
      await trackResourceUsage(enrichedEvent, env);
      
      processedEvents.push(enrichedEvent);
      
    } catch (error) {
      console.error('Error processing event:', error);
      errors.push(`Event ${event.eventType}: ${error.message}`);
    }
  }

  // Update session analytics
  await updateSessionAnalytics(sessionId, processedEvents, env);

  return {
    success: true,
    processed: processedEvents.length,
    errors: errors.length > 0 ? errors : undefined,
    rateLimitRemaining: await getRateLimitRemaining(env),
  };
}

/**
 * Enrich event with additional metadata
 */
async function enrichEvent(event, env) {
  const enriched = {
    ...event,
    enrichedAt: Date.now(),
    workerLocation: env.CF_COLO || 'unknown',
    requestId: crypto.randomUUID(),
  };

  // Add geolocation data if available from CF headers
  if (env.CF_IPCOUNTRY) {
    enriched.geo = {
      country: env.CF_IPCOUNTRY,
      region: env.CF_REGION,
      city: env.CF_CITY,
    };
  }

  // Calculate derived metrics
  if (event.performance) {
    enriched.derivedMetrics = calculateDerivedMetrics(event.performance);
  }

  return enriched;
}

/**
 * Calculate derived performance metrics
 */
function calculateDerivedMetrics(performance) {
  const metrics = {};

  // Performance score calculation
  if (performance.loadTime && performance.renderTime) {
    metrics.performanceScore = Math.max(0, 100 - (performance.loadTime / 100));
  }

  // Cache efficiency
  if (performance.cacheHitRate !== undefined) {
    metrics.cacheEfficiency = performance.cacheHitRate > 80 ? 'excellent' : 
                             performance.cacheHitRate > 60 ? 'good' : 
                             performance.cacheHitRate > 40 ? 'fair' : 'poor';
  }

  // Memory pressure indicator
  if (performance.memoryUsage) {
    metrics.memoryPressure = performance.memoryUsage > 100 * 1024 * 1024 ? 'high' : 
                            performance.memoryUsage > 50 * 1024 * 1024 ? 'medium' : 'low';
  }

  return metrics;
}

/**
 * Store event in Cloudflare KV for analysis
 */
async function storeEventInKV(event, env) {
  if (!env.ANALYTICS_KV) {
    return;
  }

  const key = `event:${event.sessionId}:${event.timestamp}:${event.requestId}`;
  const value = JSON.stringify(event);
  
  // Store with 30-day TTL
  await env.ANALYTICS_KV.put(key, value, { expirationTtl: 30 * 24 * 60 * 60 });

  // Also store in daily aggregation
  const dateKey = `daily:${new Date(event.timestamp).toISOString().split('T')[0]}`;
  const existingData = await env.ANALYTICS_KV.get(dateKey, 'json') || { events: [], count: 0 };
  
  existingData.events.push({
    eventType: event.eventType,
    timestamp: event.timestamp,
    performance: event.performance,
  });
  existingData.count += 1;
  
  await env.ANALYTICS_KV.put(dateKey, JSON.stringify(existingData), { 
    expirationTtl: 90 * 24 * 60 * 60 // 90 days
  });
}

/**
 * Forward event to Cloudflare Analytics API
 */
async function forwardToCloudflareAnalytics(event, siteTag, env) {
  if (!env.CLOUDFLARE_ANALYTICS_TOKEN || !env.CLOUDFLARE_ZONE_ID) {
    return;
  }

  const analyticsPayload = {
    query: `
      mutation {
        logEvent(
          zoneTag: "${env.CLOUDFLARE_ZONE_ID}"
          event: {
            eventType: "${event.eventType}"
            timestamp: ${event.timestamp}
            properties: ${JSON.stringify(event.properties)}
          }
        ) {
          success
        }
      }
    `,
  };

  const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.CLOUDFLARE_ANALYTICS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(analyticsPayload),
  });

  if (!response.ok) {
    throw new Error(`Cloudflare Analytics API error: ${response.status}`);
  }
}

/**
 * Track resource usage against free tier limits
 */
async function trackResourceUsage(event, env) {
  if (!env.ANALYTICS_KV) {
    return;
  }

  const today = new Date().toISOString().split('T')[0];
  const usageKey = `usage:${today}`;
  
  const currentUsage = await env.ANALYTICS_KV.get(usageKey, 'json') || {
    kvReads: 0,
    kvWrites: 0,
    workerRequests: 0,
    analyticsEvents: 0,
    date: today,
  };

  // Increment counters
  currentUsage.kvReads += 1; // This read operation
  currentUsage.kvWrites += 2; // Event storage + usage update
  currentUsage.workerRequests += 1;
  currentUsage.analyticsEvents += 1;

  // Check for limit warnings
  const warnings = [];
  if (currentUsage.kvReads > 80000) { // 80% of 100k daily limit
    warnings.push('KV reads approaching daily limit');
  }
  if (currentUsage.kvWrites > 800) { // 80% of 1k daily limit
    warnings.push('KV writes approaching daily limit');
  }
  if (currentUsage.workerRequests > 80000) { // 80% of 100k daily limit
    warnings.push('Worker requests approaching daily limit');
  }

  currentUsage.warnings = warnings;
  currentUsage.lastUpdated = Date.now();

  // Store updated usage with 25-hour TTL
  await env.ANALYTICS_KV.put(usageKey, JSON.stringify(currentUsage), {
    expirationTtl: 25 * 60 * 60,
  });

  // Send alerts if approaching limits
  if (warnings.length > 0) {
    await sendLimitWarnings(warnings, currentUsage, env);
  }
}

/**
 * Send warnings when approaching resource limits
 */
async function sendLimitWarnings(warnings, usage, env) {
  if (!env.WEBHOOK_URL) {
    return;
  }

  const alertPayload = {
    text: `🚨 Nexus Reader Resource Limit Warning`,
    attachments: [{
      color: 'warning',
      fields: [
        {
          title: 'Warnings',
          value: warnings.join('\n'),
          short: false,
        },
        {
          title: 'Current Usage',
          value: `KV Reads: ${usage.kvReads}\nKV Writes: ${usage.kvWrites}\nWorker Requests: ${usage.workerRequests}`,
          short: true,
        },
      ],
    }],
  };

  await fetch(env.WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(alertPayload),
  });
}

/**
 * Update session-level analytics
 */
async function updateSessionAnalytics(sessionId, events, env) {
  if (!env.ANALYTICS_KV) {
    return;
  }

  const sessionKey = `session:${sessionId}`;
  const existingSession = await env.ANALYTICS_KV.get(sessionKey, 'json') || {
    sessionId,
    startTime: Date.now(),
    eventCount: 0,
    events: [],
  };

  existingSession.eventCount += events.length;
  existingSession.lastActivity = Date.now();
  existingSession.events.push(...events.map(e => ({
    eventType: e.eventType,
    timestamp: e.timestamp,
  })));

  // Store with 24-hour TTL
  await env.ANALYTICS_KV.put(sessionKey, JSON.stringify(existingSession), {
    expirationTtl: 24 * 60 * 60,
  });
}

/**
 * Get remaining rate limit quota
 */
async function getRateLimitRemaining(env) {
  if (!env.ANALYTICS_KV) {
    return null;
  }

  const today = new Date().toISOString().split('T')[0];
  const usageKey = `usage:${today}`;
  const usage = await env.ANALYTICS_KV.get(usageKey, 'json');

  if (!usage) {
    return {
      kvReads: 100000,
      kvWrites: 1000,
      workerRequests: 100000,
    };
  }

  return {
    kvReads: Math.max(0, 100000 - usage.kvReads),
    kvWrites: Math.max(0, 1000 - usage.kvWrites),
    workerRequests: Math.max(0, 100000 - usage.workerRequests),
  };
}

/**
 * Handle CORS preflight requests
 */
function handleCORS() {
  return new Response(null, {
    status: 204,
    headers: getCORSHeaders(),
  });
}

/**
 * Get CORS headers
 */
function getCORSHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Analytics-Version, X-Session-ID',
    'Access-Control-Max-Age': '86400',
  };
}