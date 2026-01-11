# 部署指南 (Deployment Guide)

## 概述 (Overview)

本指南详细介绍如何部署 Nexus Reader 到生产环境。系统采用全自动化部署流程，通过 GitHub Actions 实现持续集成和持续部署 (CI/CD)。

## 🏗️ 架构概览 (Architecture Overview)

```
GitHub Repository
    ↓ (Push to main)
GitHub Actions CI/CD
    ↓ (Build & Test)
Cloudflare Workers
    ↓ (Edge Computing)
Cloudflare CDN
    ↓ (Global Distribution)
用户设备 (User Devices)
```

## 📋 部署前准备 (Pre-deployment Setup)

### 1. 账户准备 (Account Setup)

#### Cloudflare 账户
1. 注册 [Cloudflare](https://cloudflare.com) 账户
2. 添加域名到 Cloudflare
3. 获取 API Token:
   - 访问 `My Profile` → `API Tokens`
   - 创建自定义 Token，权限包括:
     - `Zone:Zone:Read`
     - `Zone:DNS:Edit`
     - `Account:Cloudflare Workers:Edit`
     - `Zone:Zone Settings:Edit`

#### GitHub 账户
1. Fork 或克隆项目仓库
2. 启用 GitHub Actions
3. 配置 Repository Secrets (见下文)

### 2. 环境变量配置 (Environment Variables)

在 GitHub Repository Settings → Secrets and variables → Actions 中添加以下 Secrets:

#### Cloudflare 相关
```bash
CLOUDFLARE_API_TOKEN=your_cloudflare_api_token
CLOUDFLARE_ACCOUNT_ID=your_account_id
CLOUDFLARE_ZONE_ID=your_zone_id
CLOUDFLARE_DOMAIN=your-domain.com
```

#### 应用配置
```bash
APP_ENV=production
APP_SECRET_KEY=your_secret_key_32_chars
DATABASE_URL=your_database_connection_string
REDIS_URL=your_redis_connection_string
```

#### AI 服务配置
```bash
OPENAI_API_KEY=your_openai_api_key
CLOUDFLARE_AI_API_TOKEN=your_cf_ai_token
```

#### 监控和分析
```bash
ANALYTICS_API_KEY=your_analytics_key
ERROR_REPORTING_DSN=your_error_reporting_dsn
```

### 3. 域名配置 (Domain Configuration)

#### DNS 设置
在 Cloudflare DNS 管理中添加以下记录:

```dns
# 主域名
A    @              192.0.2.1    (Proxied)
A    www            192.0.2.1    (Proxied)

# API 子域名
CNAME api           your-domain.com (Proxied)

# CDN 子域名
CNAME cdn           your-domain.com (Proxied)

# 静态资源
CNAME static        your-domain.com (Proxied)
```

#### SSL/TLS 配置
1. 在 Cloudflare SSL/TLS 设置中选择 "Full (strict)"
2. 启用 "Always Use HTTPS"
3. 启用 "HTTP Strict Transport Security (HSTS)"

## 🚀 自动部署流程 (Automated Deployment)

### 1. GitHub Actions 工作流 (GitHub Actions Workflow)

系统使用以下工作流实现自动部署:

#### 主部署工作流 (Main Deployment Workflow)
```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run tests
        run: npm test
      
      - name: Run property tests
        run: npm run test:property

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build application
        run: npm run build
        env:
          NODE_ENV: production
      
      - name: Upload build artifacts
        uses: actions/upload-artifact@v4
        with:
          name: build-files
          path: dist/

  deploy-workers:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Deploy Cloudflare Workers
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: publish --env production

  deploy-static:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Download build artifacts
        uses: actions/download-artifact@v4
        with:
          name: build-files
          path: dist/
      
      - name: Deploy to Cloudflare Pages
        uses: cloudflare/pages-action@v1
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          projectName: nexus-reader
          directory: dist
          gitHubToken: ${{ secrets.GITHUB_TOKEN }}

  health-check:
    needs: [deploy-workers, deploy-static]
    runs-on: ubuntu-latest
    steps:
      - name: Wait for deployment
        run: sleep 30
      
      - name: Health check
        run: |
          curl -f https://api.${{ secrets.CLOUDFLARE_DOMAIN }}/health || exit 1
          curl -f https://${{ secrets.CLOUDFLARE_DOMAIN }} || exit 1
      
      - name: Notify deployment success
        if: success()
        run: echo "Deployment successful!"
      
      - name: Rollback on failure
        if: failure()
        run: |
          echo "Deployment failed, initiating rollback..."
          # Rollback logic here
```

### 2. 部署步骤详解 (Deployment Steps Breakdown)

#### 步骤 1: 代码测试 (Code Testing)
- 运行单元测试
- 执行属性测试 (Property-based tests)
- 代码质量检查 (ESLint, TypeScript)
- 安全扫描 (CodeQL)

#### 步骤 2: 构建应用 (Build Application)
- 编译 TypeScript 代码
- 打包前端资源
- 优化静态资源
- 生成 Service Worker

#### 步骤 3: 部署 Workers (Deploy Workers)
- 部署 API 代理 Worker
- 部署同步引擎 Worker
- 部署 AI 功能 Worker
- 部署分析和监控 Worker

#### 步骤 4: 部署静态资源 (Deploy Static Assets)
- 上传到 Cloudflare Pages
- 配置 CDN 缓存规则
- 设置图片优化

#### 步骤 5: 健康检查 (Health Check)
- API 端点可用性检查
- 前端页面加载检查
- 数据库连接检查
- 外部服务集成检查

## 🔧 手动部署 (Manual Deployment)

### 1. 本地构建 (Local Build)

```bash
# 克隆仓库
git clone <repository-url>
cd nexus-reader

# 安装依赖
npm install

# 构建生产版本
npm run build

# 运行测试
npm test
```

### 2. 部署 Cloudflare Workers

```bash
# 安装 Wrangler CLI
npm install -g wrangler

# 登录 Cloudflare
wrangler login

# 部署所有 Workers
cd cloudflare-workers
wrangler publish --env production

# 或单独部署特定 Worker
wrangler publish api-proxy-worker.js --env production
wrangler publish sync-engine-worker.js --env production
wrangler publish ai-recommendation-worker.js --env production
```

### 3. 部署静态资源

```bash
# 使用 Wrangler 部署到 Pages
wrangler pages publish dist --project-name nexus-reader

# 或使用 Cloudflare Dashboard 手动上传
```

### 4. 配置 KV 存储

```bash
# 创建 KV 命名空间
wrangler kv:namespace create "NEXUS_READER_KV" --env production
wrangler kv:namespace create "NEXUS_READER_CACHE" --env production

# 更新 wrangler.toml 配置
```

## 📊 监控和维护 (Monitoring & Maintenance)

### 1. 部署后检查清单 (Post-Deployment Checklist)

#### 功能验证
- [ ] 主页正常加载
- [ ] 用户注册/登录功能
- [ ] 小说上传和阅读功能
- [ ] 多设备同步功能
- [ ] AI 推荐和搜索功能
- [ ] PWA 安装功能

#### 性能检查
- [ ] 首次内容绘制 < 1 秒
- [ ] API 响应时间 < 100ms
- [ ] CDN 缓存命中率 > 95%
- [ ] 错误率 < 1%

#### 安全检查
- [ ] HTTPS 强制重定向
- [ ] 安全头配置正确
- [ ] API 认证正常工作
- [ ] 数据加密功能正常

### 2. 监控设置 (Monitoring Setup)

#### Cloudflare Analytics
```javascript
// 在 Worker 中启用分析
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  // 记录请求指标
  const startTime = Date.now();
  
  try {
    const response = await fetch(request);
    
    // 记录成功指标
    recordMetric('request_duration', Date.now() - startTime);
    recordMetric('request_success', 1);
    
    return response;
  } catch (error) {
    // 记录错误指标
    recordMetric('request_error', 1);
    throw error;
  }
}
```

#### 健康检查端点
```javascript
// /api/health
export default {
  async fetch(request, env) {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      components: {
        api: await checkApiHealth(),
        database: await checkDatabaseHealth(),
        storage: await checkStorageHealth(),
        ai_service: await checkAIServiceHealth()
      }
    };
    
    const allHealthy = Object.values(health.components)
      .every(component => component.status === 'healthy');
    
    return new Response(JSON.stringify(health), {
      status: allHealthy ? 200 : 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
```

### 3. 日志和错误跟踪 (Logging & Error Tracking)

#### 结构化日志
```javascript
function logEvent(level, message, context = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    context,
    requestId: context.requestId || generateRequestId(),
    userId: context.userId || 'anonymous'
  };
  
  console.log(JSON.stringify(logEntry));
  
  // 发送到外部日志服务
  if (level === 'error') {
    sendToErrorTracking(logEntry);
  }
}
```

#### 错误告警
```javascript
async function sendAlert(error, context) {
  const alert = {
    title: `Nexus Reader Error: ${error.message}`,
    description: error.stack,
    severity: 'high',
    timestamp: new Date().toISOString(),
    context
  };
  
  // 发送到 Slack/Discord/Email
  await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(alert)
  });
}
```

## 🔄 回滚策略 (Rollback Strategy)

### 1. 自动回滚 (Automatic Rollback)

```yaml
# GitHub Actions 自动回滚
- name: Rollback on failure
  if: failure()
  run: |
    echo "Deployment failed, initiating rollback..."
    
    # 回滚 Workers
    wrangler rollback --env production
    
    # 回滚静态资源
    wrangler pages deployment list --project-name nexus-reader
    wrangler pages deployment rollback <previous-deployment-id>
    
    # 通知团队
    curl -X POST $SLACK_WEBHOOK \
      -H 'Content-Type: application/json' \
      -d '{"text":"🚨 Nexus Reader deployment failed and rolled back"}'
```

### 2. 手动回滚 (Manual Rollback)

```bash
# 查看部署历史
wrangler deployments list

# 回滚到特定版本
wrangler rollback <deployment-id>

# 回滚 Pages 部署
wrangler pages deployment list --project-name nexus-reader
wrangler pages deployment rollback <deployment-id>
```

### 3. 数据库迁移回滚 (Database Migration Rollback)

```bash
# 如果有数据库更改，准备回滚脚本
npm run db:rollback

# 恢复 KV 数据 (如果需要)
wrangler kv:bulk put --namespace-id <namespace-id> backup.json
```

## 🌍 多环境部署 (Multi-Environment Deployment)

### 1. 环境配置 (Environment Configuration)

#### 开发环境 (Development)
```bash
# .env.development
NODE_ENV=development
API_BASE_URL=http://localhost:3000
CLOUDFLARE_ACCOUNT_ID=dev_account_id
```

#### 预发布环境 (Staging)
```bash
# .env.staging
NODE_ENV=staging
API_BASE_URL=https://staging-api.nexus-reader.com
CLOUDFLARE_ACCOUNT_ID=staging_account_id
```

#### 生产环境 (Production)
```bash
# .env.production
NODE_ENV=production
API_BASE_URL=https://api.nexus-reader.com
CLOUDFLARE_ACCOUNT_ID=prod_account_id
```

### 2. 分支策略 (Branch Strategy)

```
main (production)
  ↑
staging (staging environment)
  ↑
develop (development environment)
  ↑
feature/* (feature branches)
```

### 3. 部署流程 (Deployment Flow)

1. **功能开发**: `feature/*` → `develop`
2. **集成测试**: `develop` → `staging`
3. **生产发布**: `staging` → `main`

## 📈 性能优化 (Performance Optimization)

### 1. CDN 配置 (CDN Configuration)

```javascript
// cloudflare-cdn-config.js
export default {
  // 缓存规则
  cacheRules: [
    {
      pattern: '*.js',
      ttl: 86400, // 24 hours
      browserTtl: 86400
    },
    {
      pattern: '*.css',
      ttl: 86400,
      browserTtl: 86400
    },
    {
      pattern: '/api/*',
      ttl: 300, // 5 minutes
      browserTtl: 0
    }
  ],
  
  // 压缩设置
  compression: {
    gzip: true,
    brotli: true
  },
  
  // 图片优化
  imageOptimization: {
    webp: true,
    avif: true,
    quality: 85
  }
};
```

### 2. Worker 优化 (Worker Optimization)

```javascript
// 使用 KV 缓存减少计算
async function getCachedResult(key, computeFn, ttl = 3600) {
  let cached = await KV.get(key);
  
  if (cached) {
    return JSON.parse(cached);
  }
  
  const result = await computeFn();
  await KV.put(key, JSON.stringify(result), { expirationTtl: ttl });
  
  return result;
}

// 批量处理请求
async function batchProcess(requests) {
  const results = await Promise.allSettled(
    requests.map(request => processRequest(request))
  );
  
  return results.map(result => 
    result.status === 'fulfilled' ? result.value : null
  );
}
```

## 🔒 安全配置 (Security Configuration)

### 1. Cloudflare 安全设置 (Cloudflare Security Settings)

#### WAF 规则 (WAF Rules)
```javascript
// 自定义 WAF 规则
const wafRules = [
  {
    description: "Block SQL injection attempts",
    expression: "(http.request.uri.query contains \"union select\" or http.request.uri.query contains \"drop table\")",
    action: "block"
  },
  {
    description: "Rate limit API endpoints",
    expression: "(http.request.uri.path matches \"/api/.*\")",
    action: "challenge",
    rateLimit: {
      threshold: 100,
      period: 60
    }
  }
];
```

#### 安全头 (Security Headers)
```javascript
// 在 Worker 中添加安全头
function addSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('X-XSS-Protection', '1; mode=block');
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  headers.set('Content-Security-Policy', 
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'");
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
```

### 2. API 安全 (API Security)

#### 认证中间件 (Authentication Middleware)
```javascript
async function authenticateRequest(request) {
  const authHeader = request.headers.get('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid authorization header');
  }
  
  const token = authHeader.substring(7);
  const payload = await verifyJWT(token);
  
  return payload;
}

// 速率限制
async function rateLimitCheck(clientId, endpoint) {
  const key = `rate_limit:${clientId}:${endpoint}`;
  const current = await KV.get(key);
  
  if (current && parseInt(current) > RATE_LIMIT) {
    throw new Error('Rate limit exceeded');
  }
  
  await KV.put(key, (parseInt(current) || 0) + 1, { expirationTtl: 3600 });
}
```

## 📋 故障排除 (Troubleshooting)

### 1. 常见部署问题 (Common Deployment Issues)

#### Worker 部署失败
```bash
# 检查 wrangler.toml 配置
wrangler whoami
wrangler kv:namespace list

# 查看详细错误信息
wrangler publish --verbose

# 检查环境变量
wrangler secret list
```

#### 静态资源部署失败
```bash
# 检查构建输出
npm run build
ls -la dist/

# 检查 Pages 项目配置
wrangler pages project list
wrangler pages deployment list --project-name nexus-reader
```

#### DNS 解析问题
```bash
# 检查 DNS 记录
dig your-domain.com
nslookup api.your-domain.com

# 检查 Cloudflare 代理状态
curl -I https://your-domain.com
```

### 2. 性能问题诊断 (Performance Issue Diagnosis)

#### 慢查询分析
```javascript
// 添加性能监控
async function monitoredFetch(url, options = {}) {
  const start = Date.now();
  
  try {
    const response = await fetch(url, options);
    const duration = Date.now() - start;
    
    // 记录慢查询
    if (duration > 1000) {
      console.warn(`Slow request: ${url} took ${duration}ms`);
    }
    
    return response;
  } catch (error) {
    console.error(`Request failed: ${url}`, error);
    throw error;
  }
}
```

#### 内存使用监控
```javascript
// 监控 Worker 内存使用
function logMemoryUsage() {
  if (typeof performance !== 'undefined' && performance.memory) {
    console.log('Memory usage:', {
      used: performance.memory.usedJSHeapSize,
      total: performance.memory.totalJSHeapSize,
      limit: performance.memory.jsHeapSizeLimit
    });
  }
}
```

### 3. 错误恢复 (Error Recovery)

#### 自动重试机制
```javascript
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      
      const delay = baseDelay * Math.pow(2, i);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

#### 熔断器模式
```javascript
class CircuitBreaker {
  constructor(threshold = 5, timeout = 60000) {
    this.threshold = threshold;
    this.timeout = timeout;
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
  }
  
  async execute(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }
    
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  onSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }
  
  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.threshold) {
      this.state = 'OPEN';
    }
  }
}
```

---

## 📞 支持 (Support)

部署过程中如遇问题，请：
1. 查看 [GitHub Actions 日志](../../actions)
2. 检查 [Cloudflare Dashboard](https://dash.cloudflare.com)
3. 参考 [故障排除指南](TROUBLESHOOTING.md)
4. 提交 [Issue](../../issues/new)

**祝您部署顺利！** 🚀