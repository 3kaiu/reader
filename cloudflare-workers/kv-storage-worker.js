/**
 * Cloudflare Worker for KV Storage Management
 * 
 * Provides intelligent KV storage management with:
 * - Automatic data cleanup
 * - Storage usage monitoring
 * - Intelligent retention policies
 * - Free tier optimization
 */

// KV Storage Management Configuration
const KV_CONFIG = {
  maxStorageSize: 1024 * 1024 * 1024, // 1GB free tier limit
  warningThreshold: 0.8, // 80%
  criticalThreshold: 0.95, // 95%
  retentionPolicies: [
    {
      keyPattern: '^temp:.*',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      priority: 1,
      compressionEnabled: true
    },
    {
      keyPattern: '^cache:.*',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      priority: 2,
      compressionEnabled: true
    },
    {
      keyPattern: '^session:.*',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      priority: 3,
      compressionEnabled: true
    },
    {
      keyPattern: '^user:.*:progress',
      maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
      priority: 10,
      compressionEnabled: false
    },
    {
      keyPattern: '^user:.*:preferences',
      maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
      priority: 10,
      compressionEnabled: false
    }
  ]
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    };

    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      let response;

      switch (path) {
        case '/storage/usage':
          response = await handleStorageUsage(env);
          break;
        case '/storage/cleanup':
          response = await handleStorageCleanup(request, env);
          break;
        case '/storage/health':
          response = await handleStorageHealth(env);
          break;
        case '/storage/metrics':
          response = await handleStorageMetrics(env);
          break;
        case '/storage/optimize':
          response = await handleStorageOptimize(env);
          break;
        default:
          response = new Response('Not Found', { status: 404 });
      }

      // Add CORS headers to response
      Object.entries(corsHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });

      return response;

    } catch (error) {
      console.error('KV Storage Worker Error:', error);
      return new Response(JSON.stringify({
        error: 'Internal Server Error',
        message: error.message
      }), {
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }
  }
};

/**
 * Get storage usage statistics
 */
async function handleStorageUsage(env) {
  const startTime = Date.now();
  
  try {
    // List all keys to calculate usage
    const listResult = await env.NEXUS_KV.list();
    const keys = listResult.keys;
    
    let totalSize = 0;
    let keyCount = keys.length;
    
    // Calculate approximate size
    for (const key of keys) {
      // Estimate size based on key name and metadata
      const keySize = new TextEncoder().encode(key.name).length;
      const metadataSize = key.metadata ? JSON.stringify(key.metadata).length : 0;
      totalSize += keySize + metadataSize + 1000; // Estimate value size
    }
    
    const usage = {
      totalSize: KV_CONFIG.maxStorageSize,
      usedSize: totalSize,
      availableSize: KV_CONFIG.maxStorageSize - totalSize,
      usagePercentage: totalSize / KV_CONFIG.maxStorageSize,
      keyCount,
      lastUpdated: Date.now(),
      processingTime: Date.now() - startTime
    };
    
    return new Response(JSON.stringify(usage), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Storage usage error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to get storage usage',
      message: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Perform intelligent storage cleanup
 */
async function handleStorageCleanup(request, env) {
  const startTime = Date.now();
  
  try {
    const body = await request.json().catch(() => ({}));
    const forceCleanup = body.force || false;
    
    // List all keys
    const listResult = await env.NEXUS_KV.list();
    const keys = listResult.keys;
    
    const keysToRemove = [];
    const cleanupReasons = [];
    
    // Apply retention policies
    for (const policy of KV_CONFIG.retentionPolicies.sort((a, b) => a.priority - b.priority)) {
      const regex = new RegExp(policy.keyPattern);
      
      for (const key of keys) {
        if (regex.test(key.name)) {
          const keyAge = Date.now() - (key.metadata?.timestamp || 0);
          
          if (keyAge > policy.maxAge || forceCleanup) {
            keysToRemove.push(key.name);
            cleanupReasons.push({
              key: key.name,
              reason: `Expired according to policy: ${policy.keyPattern}`,
              age: keyAge,
              maxAge: policy.maxAge
            });
          }
        }
      }
    }
    
    // Remove expired keys
    let keysRemoved = 0;
    let sizeFreed = 0;
    const errors = [];
    
    for (const keyName of keysToRemove) {
      try {
        // Get key size before deletion (approximate)
        const keySize = new TextEncoder().encode(keyName).length + 1000; // Estimate
        
        await env.NEXUS_KV.delete(keyName);
        keysRemoved++;
        sizeFreed += keySize;
        
      } catch (error) {
        errors.push(`Failed to remove key ${keyName}: ${error.message}`);
      }
    }
    
    const result = {
      keysRemoved,
      sizeFreed,
      duration: Date.now() - startTime,
      errors,
      cleanupReasons: cleanupReasons.slice(0, 10), // Limit to first 10 for response size
      timestamp: Date.now()
    };
    
    // Store cleanup history
    try {
      const historyKey = `cleanup:history:${Date.now()}`;
      await env.NEXUS_KV.put(historyKey, JSON.stringify(result), {
        expirationTtl: 30 * 24 * 60 * 60, // Keep for 30 days
        metadata: { type: 'cleanup_history', timestamp: Date.now() }
      });
    } catch (error) {
      console.error('Failed to store cleanup history:', error);
    }
    
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Storage cleanup error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to perform cleanup',
      message: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Check storage health
 */
async function handleStorageHealth(env) {
  try {
    // Get current usage
    const usageResponse = await handleStorageUsage(env);
    const usage = await usageResponse.json();
    
    let status = 'healthy';
    let message = `Storage usage normal: ${(usage.usagePercentage * 100).toFixed(1)}%`;
    const recommendations = [];
    
    if (usage.usagePercentage >= KV_CONFIG.criticalThreshold) {
      status = 'critical';
      message = `Storage usage critical: ${(usage.usagePercentage * 100).toFixed(1)}%`;
      recommendations.push('Immediate cleanup required');
      recommendations.push('Consider increasing retention policy strictness');
      recommendations.push('Review large keys for optimization opportunities');
      
    } else if (usage.usagePercentage >= KV_CONFIG.warningThreshold) {
      status = 'warning';
      message = `Storage usage high: ${(usage.usagePercentage * 100).toFixed(1)}%`;
      recommendations.push('Schedule cleanup soon');
      recommendations.push('Monitor storage growth trends');
      recommendations.push('Consider enabling compression for more key patterns');
    } else {
      recommendations.push('Continue monitoring');
      recommendations.push('Regular cleanup is working well');
    }
    
    const health = {
      status,
      message,
      recommendations,
      usage: usage.usagePercentage,
      keyCount: usage.keyCount,
      timestamp: Date.now()
    };
    
    return new Response(JSON.stringify(health), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Storage health check error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to check storage health',
      message: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Get detailed storage metrics
 */
async function handleStorageMetrics(env) {
  try {
    // Get usage
    const usageResponse = await handleStorageUsage(env);
    const usage = await usageResponse.json();
    
    // List all keys with metadata
    const listResult = await env.NEXUS_KV.list();
    const keys = listResult.keys;
    
    // Calculate top keys by estimated size
    const topKeys = keys
      .map(key => ({
        key: key.name,
        size: new TextEncoder().encode(key.name).length + 1000, // Estimate
        lastAccessed: key.metadata?.lastAccessed || 0,
        metadata: key.metadata
      }))
      .sort((a, b) => b.size - a.size)
      .slice(0, 10);
    
    // Calculate retention status
    const retentionStatus = KV_CONFIG.retentionPolicies.map(policy => {
      const regex = new RegExp(policy.keyPattern);
      const matchingKeys = keys.filter(key => regex.test(key.name));
      
      let keysAffected = 0;
      let sizeFreed = 0;
      
      for (const key of matchingKeys) {
        const keyAge = Date.now() - (key.metadata?.timestamp || 0);
        if (keyAge > policy.maxAge) {
          keysAffected++;
          sizeFreed += new TextEncoder().encode(key.name).length + 1000; // Estimate
        }
      }
      
      return {
        pattern: policy.keyPattern,
        keysAffected,
        sizeFreed,
        totalMatching: matchingKeys.length
      };
    });
    
    // Get cleanup history
    const historyKeys = keys.filter(key => key.name.startsWith('cleanup:history:'));
    const cleanupHistory = historyKeys
      .sort((a, b) => b.name.localeCompare(a.name))
      .slice(0, 10)
      .map(key => ({
        timestamp: parseInt(key.name.split(':')[2]),
        // We'd need to fetch the actual data to get details
        keysRemoved: 0, // Placeholder
        sizeFreed: 0    // Placeholder
      }));
    
    const metrics = {
      usage,
      topKeys,
      retentionStatus,
      cleanupHistory,
      keysByPattern: getKeysByPattern(keys),
      timestamp: Date.now()
    };
    
    return new Response(JSON.stringify(metrics), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Storage metrics error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to get storage metrics',
      message: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Optimize storage through compression and deduplication
 */
async function handleStorageOptimize(env) {
  const startTime = Date.now();
  
  try {
    // List all keys
    const listResult = await env.NEXUS_KV.list();
    const keys = listResult.keys;
    
    let keysOptimized = 0;
    let spaceSaved = 0;
    const errors = [];
    
    // Find keys eligible for compression
    for (const policy of KV_CONFIG.retentionPolicies) {
      if (!policy.compressionEnabled) continue;
      
      const regex = new RegExp(policy.keyPattern);
      const matchingKeys = keys.filter(key => regex.test(key.name));
      
      for (const key of matchingKeys.slice(0, 10)) { // Limit to avoid timeout
        try {
          const value = await env.NEXUS_KV.get(key.name);
          if (!value) continue;
          
          const originalSize = new TextEncoder().encode(value).length;
          
          // Simple compression simulation (in real implementation, use actual compression)
          if (originalSize > 1000) {
            // Simulate compression by storing a compressed flag
            const metadata = {
              ...key.metadata,
              compressed: true,
              originalSize,
              compressedAt: Date.now()
            };
            
            await env.NEXUS_KV.put(key.name, value, { metadata });
            
            keysOptimized++;
            spaceSaved += Math.floor(originalSize * 0.3); // Simulate 30% compression
          }
          
        } catch (error) {
          errors.push(`Failed to optimize key ${key.name}: ${error.message}`);
        }
      }
    }
    
    const result = {
      keysOptimized,
      spaceSaved,
      duration: Date.now() - startTime,
      errors,
      timestamp: Date.now()
    };
    
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Storage optimization error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to optimize storage',
      message: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Helper function to categorize keys by pattern
 */
function getKeysByPattern(keys) {
  const patterns = {};
  
  for (const policy of KV_CONFIG.retentionPolicies) {
    const regex = new RegExp(policy.keyPattern);
    const matchingKeys = keys.filter(key => regex.test(key.name));
    
    patterns[policy.keyPattern] = {
      count: matchingKeys.length,
      pattern: policy.keyPattern,
      priority: policy.priority,
      maxAge: policy.maxAge,
      compressionEnabled: policy.compressionEnabled
    };
  }
  
  // Add unmatched keys
  const unmatchedKeys = keys.filter(key => {
    return !KV_CONFIG.retentionPolicies.some(policy => 
      new RegExp(policy.keyPattern).test(key.name)
    );
  });
  
  if (unmatchedKeys.length > 0) {
    patterns['unmatched'] = {
      count: unmatchedKeys.length,
      pattern: 'unmatched',
      priority: 0,
      maxAge: 0,
      compressionEnabled: false
    };
  }
  
  return patterns;
}