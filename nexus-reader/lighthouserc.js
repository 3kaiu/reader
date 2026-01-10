/**
 * Lighthouse CI Configuration
 * 配置Lighthouse自动化性能审计
 */

module.exports = {
  ci: {
    // 收集配置
    collect: {
      // 要审计的URL
      url: [
        'http://localhost:3000',
        'http://localhost:3000/reader',
        'http://localhost:3000/library'
      ],
      
      // 每个URL运行的次数
      numberOfRuns: 3,
      
      // Chrome启动选项
      chromePath: undefined, // 使用系统Chrome
      chromeFlags: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--headless'
      ],
      
      // 设备模拟
      settings: {
        // 移动设备模拟
        emulatedFormFactor: 'mobile',
        throttling: {
          rttMs: 150,
          throughputKbps: 1638.4,
          cpuSlowdownMultiplier: 4
        },
        
        // 审计配置
        onlyCategories: [
          'performance',
          'accessibility',
          'best-practices',
          'seo',
          'pwa'
        ],
        
        // 跳过某些审计
        skipAudits: [
          'uses-http2',
          'canonical'
        ]
      }
    },
    
    // 断言配置
    assert: {
      assertions: {
        // 性能指标阈值
        'categories:performance': ['error', { minScore: 0.8 }],
        'categories:accessibility': ['error', { minScore: 0.9 }],
        'categories:best-practices': ['error', { minScore: 0.8 }],
        'categories:seo': ['error', { minScore: 0.8 }],
        'categories:pwa': ['warn', { minScore: 0.6 }],
        
        // Core Web Vitals
        'first-contentful-paint': ['error', { maxNumericValue: 2000 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
        'first-meaningful-paint': ['error', { maxNumericValue: 2000 }],
        'speed-index': ['error', { maxNumericValue: 3000 }],
        'interactive': ['error', { maxNumericValue: 3800 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        'total-blocking-time': ['error', { maxNumericValue: 300 }],
        
        // 资源优化
        'unused-css-rules': ['warn', { maxLength: 0 }],
        'unused-javascript': ['warn', { maxLength: 0 }],
        'modern-image-formats': ['warn', { maxLength: 0 }],
        'offscreen-images': ['warn', { maxLength: 0 }],
        'render-blocking-resources': ['warn', { maxLength: 0 }],
        'unminified-css': ['error', { maxLength: 0 }],
        'unminified-javascript': ['error', { maxLength: 0 }],
        
        // 网络优化
        'uses-text-compression': ['error', { maxLength: 0 }],
        'uses-responsive-images': ['warn', { maxLength: 0 }],
        'efficient-animated-content': ['warn', { maxLength: 0 }],
        
        // 缓存策略
        'uses-long-cache-ttl': ['warn', { minScore: 0.7 }],
        
        // 可访问性
        'color-contrast': ['error', { maxLength: 0 }],
        'image-alt': ['error', { maxLength: 0 }],
        'label': ['error', { maxLength: 0 }],
        'link-name': ['error', { maxLength: 0 }],
        
        // 最佳实践
        'is-on-https': ['error', { maxLength: 0 }],
        'uses-http2': 'off', // 在开发环境中跳过
        'no-vulnerable-libraries': ['error', { maxLength: 0 }],
        
        // SEO
        'meta-description': ['error', { maxLength: 0 }],
        'document-title': ['error', { maxLength: 0 }],
        'html-has-lang': ['error', { maxLength: 0 }],
        
        // PWA
        'service-worker': ['warn', { maxLength: 0 }],
        'installable-manifest': ['warn', { maxLength: 0 }],
        'splash-screen': ['warn', { maxLength: 0 }],
        'themed-omnibox': ['warn', { maxLength: 0 }]
      }
    },
    
    // 上传配置
    upload: {
      target: 'temporary-public-storage',
      // 如果使用LHCI服务器，配置如下：
      // target: 'lhci',
      // serverBaseUrl: 'https://your-lhci-server.com',
      // token: 'your-build-token'
    },
    
    // 服务器配置（如果使用本地服务器）
    server: {
      port: 9001,
      storage: {
        storageMethod: 'sql',
        sqlDialect: 'sqlite',
        sqlDatabasePath: './lhci.db'
      }
    }
  }
}