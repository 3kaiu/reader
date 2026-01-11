// Cloudflare CDN and Caching Configuration for Nexus Reader
// This configuration optimizes content delivery and caching strategies

const CDN_CONFIG = {
  // Cache rules for different content types
  cacheRules: {
    // Static assets - long cache duration
    staticAssets: {
      patterns: [
        '*.js',
        '*.css', 
        '*.woff2',
        '*.woff',
        '*.ttf',
        '*.ico',
        '*.png',
        '*.jpg',
        '*.jpeg',
        '*.webp',
        '*.svg'
      ],
      cacheTtl: 31536000, // 1 year
      browserTtl: 31536000, // 1 year
      edgeTtl: 31536000, // 1 year
      cacheLevel: 'cache_everything',
      cacheByDeviceType: false
    },

    // Application shell - medium cache duration
    appShell: {
      patterns: [
        '/',
        '/index.html',
        '/manifest.json',
        '/sw.js'
      ],
      cacheTtl: 3600, // 1 hour
      browserTtl: 0, // Always revalidate
      edgeTtl: 3600, // 1 hour
      cacheLevel: 'cache_everything',
      cacheByDeviceType: true
    },

    // API responses - short cache duration
    apiResponses: {
      patterns: [
        '/api/novels',
        '/api/user/preferences',
        '/api/reading/progress'
      ],
      cacheTtl: 300, // 5 minutes
      browserTtl: 0, // No browser cache
      edgeTtl: 300, // 5 minutes
      cacheLevel: 'cache_everything',
      cacheByDeviceType: false,
      varyHeaders: ['Authorization', 'User-Agent']
    },

    // Dynamic content - no cache
    dynamicContent: {
      patterns: [
        '/api/auth/*',
        '/api/sync/*',
        '/ws/*',
        '/health'
      ],
      cacheTtl: 0, // No cache
      browserTtl: 0, // No cache
      edgeTtl: 0, // No cache
      cacheLevel: 'bypass'
    }
  },

  // Page rules for optimization
  pageRules: [
    {
      url: '*.nexus-reader.yourdomain.com/static/*',
      settings: {
        cache_level: 'cache_everything',
        edge_cache_ttl: 31536000,
        browser_cache_ttl: 31536000,
        always_online: 'on',
        brotli: 'on',
        minify: {
          css: 'on',
          js: 'on',
          html: 'on'
        }
      }
    },
    {
      url: '*.nexus-reader.yourdomain.com/api/*',
      settings: {
        cache_level: 'cache_everything',
        edge_cache_ttl: 300,
        browser_cache_ttl: 0,
        always_online: 'off',
        brotli: 'on'
      }
    },
    {
      url: 'nexus-reader.yourdomain.com/*',
      settings: {
        cache_level: 'cache_everything',
        edge_cache_ttl: 3600,
        browser_cache_ttl: 0,
        always_online: 'on',
        brotli: 'on',
        minify: {
          css: 'on',
          js: 'on',
          html: 'on'
        },
        ssl: 'full_strict',
        security_level: 'medium',
        rocket_loader: 'on'
      }
    }
  ],

  // Cache purge strategies
  cachePurge: {
    // Automatic purge triggers
    triggers: [
      {
        event: 'deployment_complete',
        purgeType: 'purge_everything',
        delay: 0
      },
      {
        event: 'content_update',
        purgeType: 'purge_by_tag',
        tags: ['novels', 'user-content'],
        delay: 30
      },
      {
        event: 'config_change',
        purgeType: 'purge_by_url',
        urls: [
          '/manifest.json',
          '/sw.js',
          '/'
        ],
        delay: 0
      }
    ],

    // Manual purge endpoints
    endpoints: {
      purgeAll: '/api/admin/cache/purge-all',
      purgeByTag: '/api/admin/cache/purge-tag',
      purgeByUrl: '/api/admin/cache/purge-url'
    }
  },

  // Performance optimizations
  performance: {
    // Compression settings
    compression: {
      brotli: true,
      gzip: true,
      minFileSize: 1024, // 1KB minimum
      compressionLevel: 6
    },

    // Image optimization
    images: {
      polish: 'lossy',
      webp: true,
      avif: true,
      resizing: true,
      qualityAuto: true
    },

    // HTTP/2 and HTTP/3
    protocols: {
      http2: true,
      http3: true,
      zeroRtt: true
    },

    // Early hints
    earlyHints: {
      enabled: true,
      links: [
        '</static/css/main.css>; rel=preload; as=style',
        '</static/js/main.js>; rel=preload; as=script',
        '</static/fonts/main.woff2>; rel=preload; as=font; crossorigin'
      ]
    }
  },

  // Security headers
  securityHeaders: {
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self' wss: https:",
      "media-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join('; ')
  },

  // Analytics and monitoring
  analytics: {
    webAnalytics: true,
    performanceMonitoring: true,
    customMetrics: [
      'cache_hit_rate',
      'origin_response_time',
      'edge_response_time',
      'bandwidth_saved',
      'requests_per_second'
    ]
  }
};

// Cache warming strategy
const CACHE_WARMING = {
  // Critical paths to pre-warm
  criticalPaths: [
    '/',
    '/manifest.json',
    '/sw.js',
    '/api/novels/popular',
    '/api/user/preferences/default'
  ],

  // Warming schedule
  schedule: {
    afterDeployment: true,
    dailyWarmup: '02:00', // 2 AM UTC
    weeklyFullWarm: 'sunday'
  },

  // Warming regions
  regions: [
    'us-east',
    'us-west', 
    'eu-central',
    'asia-pacific'
  ]
};

// Cache invalidation rules
const CACHE_INVALIDATION = {
  // Content-based invalidation
  contentRules: [
    {
      contentType: 'novel',
      invalidatePatterns: [
        '/api/novels/{id}',
        '/api/novels/{id}/chapters',
        '/api/search*'
      ],
      propagationDelay: 30
    },
    {
      contentType: 'user_preference',
      invalidatePatterns: [
        '/api/user/preferences',
        '/api/user/settings'
      ],
      propagationDelay: 0
    }
  ],

  // Time-based invalidation
  timeRules: [
    {
      pattern: '/api/novels/trending',
      interval: 3600 // 1 hour
    },
    {
      pattern: '/api/stats/*',
      interval: 1800 // 30 minutes
    }
  ]
};

// Export configuration for use in Cloudflare Workers
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CDN_CONFIG,
    CACHE_WARMING,
    CACHE_INVALIDATION
  };
}

// Cloudflare Worker script for dynamic cache control
const WORKER_SCRIPT = `
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  const cache = caches.default;
  
  // Apply cache rules based on path
  const cacheRule = getCacheRule(url.pathname);
  
  if (cacheRule.cacheLevel === 'bypass') {
    return fetch(request);
  }
  
  // Check cache first
  let response = await cache.match(request);
  
  if (!response) {
    // Fetch from origin
    response = await fetch(request);
    
    // Apply caching headers
    if (response.ok && cacheRule.cacheTtl > 0) {
      const modifiedResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          ...response.headers,
          'Cache-Control': \`public, max-age=\${cacheRule.cacheTtl}\`,
          'CDN-Cache-Control': \`max-age=\${cacheRule.edgeTtl}\`,
          'Cloudflare-CDN-Cache-Control': \`max-age=\${cacheRule.edgeTtl}\`
        }
      });
      
      // Store in cache
      event.waitUntil(cache.put(request, modifiedResponse.clone()));
      return modifiedResponse;
    }
  }
  
  return response;
}

function getCacheRule(pathname) {
  const config = ${JSON.stringify(CDN_CONFIG.cacheRules)};
  
  // Check static assets
  for (const pattern of config.staticAssets.patterns) {
    if (pathname.endsWith(pattern.replace('*', ''))) {
      return config.staticAssets;
    }
  }
  
  // Check API responses
  for (const pattern of config.apiResponses.patterns) {
    if (pathname.startsWith(pattern.replace('*', ''))) {
      return config.apiResponses;
    }
  }
  
  // Check dynamic content
  for (const pattern of config.dynamicContent.patterns) {
    if (pathname.startsWith(pattern.replace('*', ''))) {
      return config.dynamicContent;
    }
  }
  
  // Default to app shell rules
  return config.appShell;
}
`;

console.log('Cloudflare CDN Configuration loaded');
console.log('Cache rules configured for:', Object.keys(CDN_CONFIG.cacheRules));
console.log('Performance optimizations enabled');
console.log('Security headers configured');
console.log('Analytics and monitoring enabled');