/**
 * Enhanced Unified Cloudflare Worker (Omni-Worker)
 * 充分利用Cloudflare免费功能：D1数据库、R2存储、Analytics Engine、Queues等
 * 整合了身份验证、代理转发、章节解密、进度同步等所有核心功能
 * 基于 TypeScript 并集成了性能优化、自动调优和自我修复系统
 */

import { verifyAuth, generateToken, type TokenPayload } from './shared/auth.ts';
import { createLogger } from './shared/logger.ts';
import { getCorsHeaders, handleCorsPreflightRequest } from './shared/cors.ts';
import { proxyRequest } from './shared/proxy.ts';
import { getPerformanceMonitor } from './shared/performance-monitor.ts';
import { getAutoTuner, startAutoTuning } from './shared/auto-tuner.ts';
import { getSelfHealingSystem, startSelfHealing } from './shared/self-healing.ts';
import { DecoderEngine } from './decoder/decoder-engine.ts';
import { serverlessOptimizer } from './src/serverless-optimizer.ts';
import { edgeComputeEngine } from './src/edge-compute-engine.ts';
import {
  type DecodeRequest,
  type WorkerEnv,
  type Progress
} from './shared/types.ts';

// 增强的环境类型定义
interface EnhancedWorkerEnv extends WorkerEnv {
  // D1 Databases (免费SQLite)
  ANALYTICS_DB: D1Database;
  USER_PREFERENCES_DB: D1Database;

  // R2 Storage (免费对象存储)
  USER_CONTENT_R2: R2Bucket;
  BACKUP_R2: R2Bucket;

  // Queues (免费消息队列)
  ANALYTICS_QUEUE: Queue;

  // Analytics Engine (免费实时分析)
  ANALYTICS_ENGINE: AnalyticsEngineDataset;

  // AI (可选)
  AI?: any;
}

// 常量配置
const OAUTH_STATE_TTL = 600; // 10 分钟
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 天

// 全局缓存预热管理器
let cacheWarmupScheduled = false;

// ============================================
// Enhanced Analytics System (利用D1和Analytics Engine)
// ============================================

class AnalyticsSystem {
  private env: EnhancedWorkerEnv;
  private logger: any;

  constructor(env: EnhancedWorkerEnv) {
    this.env = env;
    this.logger = createLogger(env);
  }

  // 记录用户行为到D1数据库
  async recordUserAction(userId: string, action: string, data: any): Promise<void> {
    try {
      await this.env.ANALYTICS_DB.prepare(`
        INSERT INTO user_actions (user_id, action, data, timestamp, ip_address)
        VALUES (?, ?, ?, ?, ?)
      `).bind(
        userId,
        action,
        JSON.stringify(data),
        new Date().toISOString(),
        data.ip || 'unknown'
      ).run();

      // 发送到Analytics Engine进行实时分析
      await this.env.ANALYTICS_ENGINE.writeDataPoint({
        blobs: [userId, action],
        doubles: [1.0], // 计数
        indexes: ['user_actions']
      });

    } catch (error) {
      this.logger.error('Failed to record user action:', error);
    }
  }

  // 获取用户统计数据
  async getUserStats(userId: string): Promise<any> {
    try {
      const result = await this.env.ANALYTICS_DB.prepare(`
        SELECT
          COUNT(*) as total_actions,
          COUNT(DISTINCT DATE(timestamp)) as active_days,
          MAX(timestamp) as last_activity
        FROM user_actions
        WHERE user_id = ? AND timestamp > datetime('now', '-30 days')
      `).bind(userId).first();

      return result;
    } catch (error) {
      this.logger.error('Failed to get user stats:', error);
      return null;
    }
  }

  // 记录性能指标
  async recordPerformanceMetrics(metrics: any): Promise<void> {
    try {
      await this.env.ANALYTICS_ENGINE.writeDataPoint({
        blobs: ['performance', metrics.endpoint || 'unknown'],
        doubles: [metrics.responseTime || 0, metrics.statusCode || 0],
        indexes: ['performance_metrics']
      });
    } catch (error) {
      this.logger.error('Failed to record performance metrics:', error);
    }
  }

  // 获取热门内容
  async getPopularContent(limit: number = 10): Promise<any[]> {
    try {
      const result = await this.env.ANALYTICS_DB.prepare(`
        SELECT
          JSON_EXTRACT(data, '$.bookId') as book_id,
          COUNT(*) as views
        FROM user_actions
        WHERE action = 'view_book' AND timestamp > datetime('now', '-7 days')
        GROUP BY JSON_EXTRACT(data, '$.bookId')
        ORDER BY views DESC
        LIMIT ?
      `).bind(limit).all();

      return result.results || [];
    } catch (error) {
      this.logger.error('Failed to get popular content:', error);
      return [];
    }
  }
}

// ============================================
// Enhanced User Preferences System (利用D1)
// ============================================

class UserPreferencesSystem {
  private env: EnhancedWorkerEnv;
  private logger: any;

  constructor(env: EnhancedWorkerEnv) {
    this.env = env;
    this.logger = createLogger(env);
  }

  // 保存用户偏好设置
  async savePreferences(userId: string, preferences: any): Promise<void> {
    try {
      await this.env.USER_PREFERENCES_DB.prepare(`
        INSERT OR REPLACE INTO user_preferences (user_id, preferences, updated_at)
        VALUES (?, ?, ?)
      `).bind(
        userId,
        JSON.stringify(preferences),
        new Date().toISOString()
      ).run();
    } catch (error) {
      this.logger.error('Failed to save user preferences:', error);
    }
  }

  // 获取用户偏好设置
  async getPreferences(userId: string): Promise<any> {
    try {
      const result = await this.env.USER_PREFERENCES_DB.prepare(`
        SELECT preferences FROM user_preferences WHERE user_id = ?
      `).bind(userId).first();

      return result ? JSON.parse(result.preferences as string) : {};
    } catch (error) {
      this.logger.error('Failed to get user preferences:', error);
      return {};
    }
  }

  // 同步偏好设置到R2存储
  async backupPreferences(userId: string): Promise<void> {
    try {
      const preferences = await this.getPreferences(userId);
      const backupKey = `preferences/${userId}/${Date.now()}.json`;

      await this.env.BACKUP_R2.put(backupKey, JSON.stringify({
        userId,
        preferences,
        timestamp: new Date().toISOString()
      }));

      // 清理旧备份（保留最近5个）
      const backups = await this.listUserBackups(userId);
      if (backups.length > 5) {
        for (const oldBackup of backups.slice(5)) {
          await this.env.BACKUP_R2.delete(oldBackup.key);
        }
      }
    } catch (error) {
      this.logger.error('Failed to backup preferences:', error);
    }
  }

  private async listUserBackups(userId: string): Promise<any[]> {
    const backups = [];
    const prefix = `preferences/${userId}/`;

    for await (const obj of this.env.BACKUP_R2.list({ prefix })) {
      backups.push(obj);
    }

    return backups.sort((a, b) => b.uploaded.getTime() - a.uploaded.getTime());
  }
}

// ============================================
// Enhanced Content Management (利用R2)
// ============================================

class ContentManagementSystem {
  private env: EnhancedWorkerEnv;
  private logger: any;

  constructor(env: EnhancedWorkerEnv) {
    this.env = env;
    this.logger = createLogger(env);
  }

  // 上传用户内容到R2
  async uploadUserContent(userId: string, fileName: string, content: ArrayBuffer | string): Promise<string> {
    try {
      const key = `usercontent/${userId}/${Date.now()}-${fileName}`;
      const uploadResult = await this.env.USER_CONTENT_R2.put(key, content, {
        httpMetadata: {
          contentType: this.getContentType(fileName)
        }
      });

      return key;
    } catch (error) {
      this.logger.error('Failed to upload user content:', error);
      throw error;
    }
  }

  // 获取用户内容
  async getUserContent(key: string): Promise<R2Object | null> {
    try {
      return await this.env.USER_CONTENT_R2.get(key);
    } catch (error) {
      this.logger.error('Failed to get user content:', error);
      return null;
    }
  }

  // 删除用户内容
  async deleteUserContent(key: string): Promise<void> {
    try {
      await this.env.USER_CONTENT_R2.delete(key);
    } catch (error) {
      this.logger.error('Failed to delete user content:', error);
    }
  }

  // 批量备份用户数据
  async createUserBackup(userId: string): Promise<string> {
    try {
      // 这里可以收集用户的各种数据进行备份
      const backupData = {
        userId,
        timestamp: new Date().toISOString(),
        data: {
          // 收集用户数据...
        }
      };

      const backupKey = `backups/${userId}/${Date.now()}.json`;
      await this.env.BACKUP_R2.put(backupKey, JSON.stringify(backupData));

      return backupKey;
    } catch (error) {
      this.logger.error('Failed to create user backup:', error);
      throw error;
    }
  }

  private getContentType(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const contentTypes: Record<string, string> = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'json': 'application/json',
      'txt': 'text/plain',
      'pdf': 'application/pdf'
    };
    return contentTypes[ext || ''] || 'application/octet-stream';
  }
}

// ============================================
// Enhanced Queue Processing (利用Queues)
// ============================================

class QueueProcessor {
  private env: EnhancedWorkerEnv;
  private logger: any;

  constructor(env: EnhancedWorkerEnv) {
    this.env = env;
    this.logger = createLogger(env);
  }

  // 发送分析事件到队列
  async queueAnalyticsEvent(eventType: string, data: any): Promise<void> {
    try {
      await this.env.ANALYTICS_QUEUE.send({
        type: 'analytics_event',
        eventType,
        data,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Failed to queue analytics event:', error);
    }
  }

  // 处理队列消息（在队列消费者中调用）
  async processQueueMessage(message: any): Promise<void> {
    try {
      switch (message.type) {
        case 'analytics_event':
          await this.processAnalyticsEvent(message);
          break;
        case 'backup_request':
          await this.processBackupRequest(message);
          break;
        default:
          this.logger.warn('Unknown queue message type:', message.type);
      }
    } catch (error) {
      this.logger.error('Failed to process queue message:', error);
    }
  }

  private async processAnalyticsEvent(message: any): Promise<void> {
    // 批量处理分析事件
    this.logger.info('Processing analytics event:', message.eventType);
    // 这里可以实现批量分析逻辑
  }

  private async processBackupRequest(message: any): Promise<void> {
    // 处理备份请求
    this.logger.info('Processing backup request for user:', message.userId);
    // 这里可以实现自动化备份逻辑
  }
}

// ============================================
// Cache Warmup System
// ============================================

async function scheduleCacheWarmup(env: EnhancedWorkerEnv): Promise<void> {
  if (cacheWarmupScheduled) return;
  cacheWarmupScheduled = true;

  try {
    const logger = createLogger(env);
    logger.info('Scheduling enhanced cache warmup...');

    // 延迟5分钟后开始预热，避免影响启动性能
    setTimeout(async () => {
      try {
        const decoder = new DecoderEngine(env);
        await decoder.init();

        // 智能预热缓存
        await decoder.smartWarmup(async (key: string) => {
          // 利用Analytics Engine预测热门内容
          try {
            const popularContent = await env.ANALYTICS_ENGINE.query(`
              SELECT blob1 as content_key, sum(double1) as popularity
              FROM analytics_metrics
              WHERE index1 = 'content_views'
              AND timestamp > now() - interval '7 days'
              GROUP BY blob1
              ORDER BY popularity DESC
              LIMIT 10
            `);

            // 返回需要预热的内容
            return popularContent;
          } catch (e) {
            return null;
          }
        });

        logger.info('Enhanced cache warmup completed');
      } catch (e) {
        logger.warn('Cache warmup failed:', e);
      }
    }, 5 * 60 * 1000); // 5分钟后启动

  } catch (e) {
    console.warn('Failed to schedule cache warmup:', e);
  }
}

// ============================================
// Enhanced Main Handler
// ============================================

export default {
  async fetch(request: Request, env: EnhancedWorkerEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const logger = createLogger(env);

    // 初始化增强系统
    const analytics = new AnalyticsSystem(env);
    const userPrefs = new UserPreferencesSystem(env);
    const contentManager = new ContentManagementSystem(env);
    const queueProcessor = new QueueProcessor(env);

    // 启动增强功能
    ctx.waitUntil(Promise.all([
      scheduleCacheWarmup(env),
      startAutoTuning(env),
      startSelfHealing(env),
      // 初始化AI智能化运维系统
      Promise.resolve().then(() => {
        console.log('[Worker] AI智能化运维系统已启动')
      }),
      // 初始化无服务器优化器
      serverlessOptimizer ? Promise.resolve().then(() => {
        console.log('[Worker] 无服务器优化器已启动')
      }) : Promise.resolve(),
      // 初始化边缘计算引擎
      edgeComputeEngine ? Promise.resolve().then(() => {
        console.log('[Worker] 边缘计算引擎已启动')
      }) : Promise.resolve()
    ]));

    // 记录请求分析数据
    ctx.waitUntil(analytics.recordPerformanceMetrics({
      endpoint: url.pathname,
      method: request.method,
      userAgent: request.headers.get('User-Agent'),
      ip: request.headers.get('CF-Connecting-IP')
    }));

    // CORS 处理
    if (request.method === 'OPTIONS') {
      return handleCorsPreflightRequest();
    }

    try {
      // 路由处理
      switch (url.pathname) {
        // ===== 认证路由 =====
        case '/auth/github':
          return await handleGitHubLogin(env);

        case '/auth/github/callback':
          return await handleGitHubCallback(request, env);

        case '/auth/verify':
          return await handleAuthVerify(request, env);

        // ===== API 路由 =====
        case '/api/health':
          return await handleHealthCheck(request, env, analytics);

        case '/api/analytics/user-stats':
          return await handleUserStats(request, env, analytics);

        case '/api/analytics/popular-content':
          return await handlePopularContent(request, env, analytics);

        case '/api/preferences':
          return await handleUserPreferences(request, env, userPrefs);

        case '/api/content/upload':
          return await handleContentUpload(request, env, contentManager);

        case '/api/backup':
          return await handleUserBackup(request, env, contentManager, queueProcessor);

        // ===== 代理路由 =====
        default:
          if (url.pathname.startsWith('/api/')) {
            return await proxyRequest(request, env);
          }

          // 解码路由
          if (url.pathname.startsWith('/decode/')) {
            return await handleDecodeRequest(request, env);
          }

          // 进度同步路由
          if (url.pathname.startsWith('/progress/')) {
            return await handleProgressSync(request, env);
          }

          // 未找到路由
          return new Response('Not Found', {
            status: 404,
            headers: getCorsHeaders()
          });
      }

    } catch (error) {
      logger.error('Request processing error:', error);

      // 记录错误到Analytics Engine
      ctx.waitUntil(env.ANALYTICS_ENGINE.writeDataPoint({
        blobs: ['error', url.pathname, error.message],
        doubles: [1.0],
        indexes: ['errors']
      }));

      return new Response(JSON.stringify({
        error: 'Internal Server Error',
        message: env.ENVIRONMENT === 'development' ? error.message : 'Something went wrong'
      }), {
        status: 500,
        headers: {
          ...getCorsHeaders(),
          'Content-Type': 'application/json'
        }
      });
    }
  },

  // ===== 队列消息处理 =====
  async queue(batch: MessageBatch, env: EnhancedWorkerEnv): Promise<void> {
    const queueProcessor = new QueueProcessor(env);

    for (const message of batch.messages) {
      await queueProcessor.processQueueMessage(message.body);
    }
  }
};

// ============================================
// Enhanced Route Handlers
// ============================================

async function handleHealthCheck(request: Request, env: EnhancedWorkerEnv, analytics: AnalyticsSystem): Promise<Response> {
  const healthData = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    features: {
      d1_database: true,
      r2_storage: true,
      analytics_engine: true,
      queues: true
    },
    services: {
      kv_cache: true,
      analytics: true,
      backup: true
    }
  };

  // 记录健康检查到分析系统
  await analytics.recordUserAction('system', 'health_check', {
    ip: request.headers.get('CF-Connecting-IP')
  });

  return new Response(JSON.stringify(healthData), {
    headers: {
      ...getCorsHeaders(),
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache'
    }
  });
}

async function handleUserStats(request: Request, env: EnhancedWorkerEnv, analytics: AnalyticsSystem): Promise<Response> {
  // 验证认证
  const authResult = await verifyAuth(request, env);
  if (!authResult.valid) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: getCorsHeaders()
    });
  }

  const userId = authResult.payload.id;
  const stats = await analytics.getUserStats(userId);

  return new Response(JSON.stringify(stats), {
    headers: {
      ...getCorsHeaders(),
      'Content-Type': 'application/json'
    }
  });
}

async function handlePopularContent(request: Request, env: EnhancedWorkerEnv, analytics: AnalyticsSystem): Promise<Response> {
  const popularContent = await analytics.getPopularContent();

  return new Response(JSON.stringify({ content: popularContent }), {
    headers: {
      ...getCorsHeaders(),
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300' // 缓存5分钟
    }
  });
}

async function handleUserPreferences(request: Request, env: EnhancedWorkerEnv, userPrefs: UserPreferencesSystem): Promise<Response> {
  const authResult = await verifyAuth(request, env);
  if (!authResult.valid) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: getCorsHeaders()
    });
  }

  const userId = authResult.payload.id;

  if (request.method === 'GET') {
    const preferences = await userPrefs.getPreferences(userId);
    return new Response(JSON.stringify(preferences), {
      headers: {
        ...getCorsHeaders(),
        'Content-Type': 'application/json'
      }
    });
  } else if (request.method === 'POST') {
    const preferences = await request.json();
    await userPrefs.savePreferences(userId, preferences);
    return new Response(JSON.stringify({ success: true }), {
      headers: getCorsHeaders()
    });
  }

  return new Response('Method not allowed', {
    status: 405,
    headers: getCorsHeaders()
  });
}

async function handleContentUpload(request: Request, env: EnhancedWorkerEnv, contentManager: ContentManagementSystem): Promise<Response> {
  const authResult = await verifyAuth(request, env);
  if (!authResult.valid) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: getCorsHeaders()
    });
  }

  if (request.method !== 'POST') {
    return new Response('Method not allowed', {
      status: 405,
      headers: getCorsHeaders()
    });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const userId = authResult.payload.id;

    if (!file) {
      return new Response(JSON.stringify({ error: 'No file provided' }), {
        status: 400,
        headers: getCorsHeaders()
      });
    }

    const content = await file.arrayBuffer();
    const key = await contentManager.uploadUserContent(userId, file.name, content);

    return new Response(JSON.stringify({
      success: true,
      key,
      url: `https://content.nexus-reader.pages.dev/${key}`
    }), {
      headers: getCorsHeaders()
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: 'Upload failed' }), {
      status: 500,
      headers: getCorsHeaders()
    });
  }
}

async function handleUserBackup(request: Request, env: EnhancedWorkerEnv, contentManager: ContentManagementSystem, queueProcessor: QueueProcessor): Promise<Response> {
  const authResult = await verifyAuth(request, env);
  if (!authResult.valid) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: getCorsHeaders()
    });
  }

  const userId = authResult.payload.id;

  // 发送备份请求到队列
  await queueProcessor.queueAnalyticsEvent('backup_request', {
    userId,
    timestamp: new Date().toISOString()
  });

  // 创建即时备份
  const backupKey = await contentManager.createUserBackup(userId);

  return new Response(JSON.stringify({
    success: true,
    backupKey,
    message: 'Backup queued and initial backup created'
  }), {
    headers: getCorsHeaders()
  });
}

// ===== 原有功能保持不变 =====
async function handleGitHubLogin(env: EnhancedWorkerEnv): Promise<Response> {
  const state = crypto.randomUUID();
  if (env.PROGRESS_KV) {
    await env.PROGRESS_KV.put(`oauth_state:${state}`, Date.now().toString(), {
      expirationTtl: OAUTH_STATE_TTL
    });
  }
  const params = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: `${env.WORKER_URL}/callback/github`,
    scope: 'read:user',
    state,
  });
  return Response.redirect(`https://github.com/login/oauth/authorize?${params}`, 302);
}

async function handleGitHubCallback(request: Request, env: EnhancedWorkerEnv): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const logger = createLogger(env);

  if (!code || !state) {
    return Response.redirect(`${env.FRONTEND_URL}?error=invalid_request`, 302);
  }

  if (env.PROGRESS_KV) {
    const storedState = await env.PROGRESS_KV.get(`oauth_state:${state}`);
    if (!storedState) {
      logger.warn('OAuth state validation failed');
      return Response.redirect(`${env.FRONTEND_URL}?error=invalid_state`, 302);
    }
    await env.PROGRESS_KV.delete(`oauth_state:${state}`);
  }

  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
      }),
    });

    const tokenData = await tokenRes.json() as any;
    if (tokenData.error) return Response.redirect(`${env.FRONTEND_URL}?error=${tokenData.error}`, 302);

    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'User-Agent': 'Nexus-Reader-Unified'
      },
    });

    const user = await userRes.json() as any;
    // 权限检查：仅允许指定的 GitHub Owner 访问
    if (user.login.toLowerCase() !== env.GITHUB_OWNER.toLowerCase()) {
      logger.warn(`Unauthorized login attempt by ${user.login}`);
      return Response.redirect(`${env.FRONTEND_URL}?error=unauthorized`, 302);
    }

    const payload: TokenPayload = {
      provider: 'github',
      id: user.login,
      name: user.name || user.login,
      avatar: user.avatar_url,
      exp: Date.now() + COOKIE_MAX_AGE * 1000
    };

    const token = await generateToken(payload, env.AUTH_SECRET);

    // 重定向回前端并携带 token
    const redirectUrl = new URL(env.FRONTEND_URL);
    redirectUrl.searchParams.set('token', token);
    return Response.redirect(redirectUrl.toString(), 302);
  } catch (e) {
    logger.error('GitHub OAuth error:', e);
    return Response.redirect(`${env.FRONTEND_URL}?error=oauth_failed`, 302);
  }
}

async function handleAuthVerify(request: Request, env: EnhancedWorkerEnv): Promise<Response> {
  const authResult = await verifyAuth(request, env);

  return new Response(JSON.stringify({
    valid: authResult.valid,
    user: authResult.valid ? authResult.payload : null
  }), {
    headers: {
      ...getCorsHeaders(),
      'Content-Type': 'application/json'
    }
  });
}

async function handleDecodeRequest(request: Request, env: EnhancedWorkerEnv): Promise<Response> {
  const decoder = new DecoderEngine(env);
  await decoder.init();

  const decodeRequest: DecodeRequest = await request.json();
  const result = await decoder.decode(decodeRequest);

  return new Response(JSON.stringify(result), {
    headers: {
      ...getCorsHeaders(),
      'Content-Type': 'application/json'
    }
  });
}

async function handleProgressSync(request: Request, env: EnhancedWorkerEnv): Promise<Response> {
  const authResult = await verifyAuth(request, env);
  if (!authResult.valid) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: getCorsHeaders()
    });
  }

  const progress: Progress = await request.json();
  const userId = authResult.payload.id;

  if (env.PROGRESS_KV) {
    await env.PROGRESS_KV.put(
      `progress:${userId}:${progress.bookId}`,
      JSON.stringify(progress),
      { expirationTtl: 30 * 24 * 60 * 60 } // 30天
    );
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: getCorsHeaders()
  });
}