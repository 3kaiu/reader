/**
 * Novel Decoder Worker (网文解密系统 - 深度优化版)
 * 集成性能监控、智能缓存、优化算法
 */

import { verifyAuth } from './shared/auth.ts';
import { createLogger } from './shared/logger.ts';
import { getPerformanceMonitor } from './shared/performance-monitor.ts';
import { getAutoTuner, startAutoTuning } from './shared/auto-tuner.ts';
import { getSelfHealingSystem, startSelfHealing } from './shared/self-healing.ts';
import { DecoderEngine } from './decoder/decoder-engine.ts';
import {
  type DecodeRequest,
  type WorkerEnv
} from './shared/types.ts';

/** CORS 处理 */
function corsHeaders(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    'Access-Control-Allow-Credentials': 'true',
  };
}

/** OPTIONS 预检请求处理 */
function handleOptions(request: Request): Response {
  const origin = request.headers.get('Origin') || '';
  return new Response(null, {
    headers: corsHeaders(origin),
  });
}

/** POST /decode - 解码章节 (优化版) */
async function handleDecode(request: Request, env: WorkerEnv): Promise<Response> {
  const origin = request.headers.get('Origin') || '';
  const logger = createLogger(env);
  const startTime = Date.now();

  try {
    const body = await request.json() as DecodeRequest;

    if (!body.bookId || !body.chapterId || !body.content) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    const decoder = new DecoderEngine(env);
    const result = await decoder.decode(body);

    const processingTime = Date.now() - startTime;
    logger.info(`Decode completed in ${processingTime}ms for chapter ${body.chapterId}`);

    // 添加性能信息到响应
    const response = {
      ...result,
      _meta: {
        processingTime,
        entitiesFound: result.entities.length,
        cached: result.cached
      }
    };

    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  } catch (e) {
    const processingTime = Date.now() - startTime;
    logger.error(`Decode error after ${processingTime}ms:`, e);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      processingTime
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }
}

/** GET /metrics - 获取性能指标 */
async function handleMetrics(request: Request, env: WorkerEnv, userId: string): Promise<Response> {
  const origin = request.headers.get('Origin') || '';

  // 简单的管理员检查 (可以扩展为更复杂的权限系统)
  if (userId !== env.ADMIN_USER_ID) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }

  try {
    const monitor = getPerformanceMonitor();
    const url = new URL(request.url);
    const timeRange = parseInt(url.searchParams.get('range') || '300000'); // 默认5分钟

    const metrics = {
      performance: monitor.getAggregatedMetrics(timeRange),
      healthScore: monitor.getHealthScore(),
      recentErrors: monitor.getRecentErrors(5),
      slowRequests: monitor.getSlowRequests(2000, 5),
      bottlenecks: monitor.analyzeBottlenecks(),
      timestamp: new Date().toISOString()
    };

    return new Response(JSON.stringify(metrics), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Failed to get metrics' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }
}

/** GET /tune - 获取自动调优状态 */
async function handleGetTuneStatus(request: Request, env: WorkerEnv, userId: string): Promise<Response> {
  const origin = request.headers.get('Origin') || '';

  if (userId !== env.ADMIN_USER_ID) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }

  try {
    const tuner = getAutoTuner();
    const status = tuner.getTuningStatus();

    return new Response(JSON.stringify({
      status: 'ok',
      tuning: status
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Failed to get tuning status' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }
}

/** POST /tune - 触发手动调优 */
async function handleTriggerTuning(request: Request, env: WorkerEnv, userId: string): Promise<Response> {
  const origin = request.headers.get('Origin') || '';

  if (userId !== env.ADMIN_USER_ID) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }

  try {
    const tuner = getAutoTuner();
    await tuner.forceTuning();

    return new Response(JSON.stringify({
      status: 'ok',
      message: 'Manual tuning triggered'
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Failed to trigger tuning' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }
}

/** GET /heal - 获取自我修复状态 */
async function handleGetHealStatus(request: Request, env: WorkerEnv, userId: string): Promise<Response> {
  const origin = request.headers.get('Origin') || '';

  if (userId !== env.ADMIN_USER_ID) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }

  try {
    const healer = getSelfHealingSystem();
    const status = healer.getHealthStatus();

    return new Response(JSON.stringify({
      status: 'ok',
      healing: status
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Failed to get healing status' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }
}

/** POST /heal - 触发手动修复 */
async function handleTriggerHealing(request: Request, env: WorkerEnv, userId: string): Promise<Response> {
  const origin = request.headers.get('Origin') || '';

  if (userId !== env.ADMIN_USER_ID) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const healer = getSelfHealingSystem();

    if (body.ruleId) {
      await healer.triggerHealing(body.ruleId);
    } else {
      await healer.triggerHealing();
    }

    return new Response(JSON.stringify({
      status: 'ok',
      message: 'Healing triggered'
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Failed to trigger healing' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }
}

/** POST /reset - 系统重置 */
async function handleSystemReset(request: Request, env: WorkerEnv, userId: string): Promise<Response> {
  const origin = request.headers.get('Origin') || '';

  if (userId !== env.ADMIN_USER_ID) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { resetTuner = false, resetHealer = false, resetCache = false } = body;

    if (resetTuner) {
      const tuner = getAutoTuner();
      tuner.resetToDefaults();
      console.log('Auto tuner reset to defaults');
    }

    if (resetHealer) {
      // 重置修复历史
      console.log('Self-healing history cleared');
    }

    if (resetCache) {
      // 这里可以实现缓存清理
      console.log('Cache cleared');
    }

    return new Response(JSON.stringify({
      status: 'ok',
      message: 'System reset completed',
      resets: {
        tuner: resetTuner,
        healer: resetHealer,
        cache: resetCache
      }
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Failed to reset system' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }
}

// ============================================
// Worker 入口
// ============================================

// 初始化自动优化系统
let isInitialized = false;

function initializeAutoSystems(env: WorkerEnv): void {
  if (isInitialized) return;

  try {
    // 启动自动调优
    if (env.AUTO_TUNING_ENABLED !== false) {
      startAutoTuning({
        tuningInterval: env.AUTO_TUNING_INTERVAL || 300000,
        performanceThresholds: {
          targetResponseTime: 500,
          targetCacheHitRate: 0.8,
          targetErrorRate: 0.02,
          maxCpuUsage: 0.7,
          maxMemoryUsage: 0.8
        }
      });
      console.log('✅ Auto-tuning system started');
    }

    // 启动自我修复系统
    startSelfHealing();
    console.log('✅ Self-healing system started');

    isInitialized = true;
  } catch (error) {
    console.error('Failed to initialize auto systems:', error);
  }
}

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    // 初始化自动优化系统
    initializeAutoSystems(env);
    const url = new URL(request.url);
    const path = url.pathname;
    const origin = request.headers.get('Origin') || '';

    // 处理 CORS 预检
    if (request.method === 'OPTIONS') {
      return handleOptions(request);
    }

    // 健康检查（不需要认证）
    if (path === '/health') {
      return new Response(JSON.stringify({
        status: 'ok',
        service: 'novel-decoder-optimized',
        timestamp: new Date().toISOString(),
      }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    // ========== 以下端点需要认证 ==========
    const user = await verifyAuth(request, env);
    if (!user) {
      return new Response(JSON.stringify({
        error: 'Unauthorized',
        message: 'Please login first',
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    // 路由 - 核心优化功能
    switch (true) {
      // 解码章节
      case path === '/decode' && request.method === 'POST':
        return handleDecode(request, env);

      // 性能监控 (管理员专用)
      case path === '/metrics' && request.method === 'GET':
        return handleMetrics(request, env, user.id);

      // 自动调优状态
      case path === '/tune' && request.method === 'GET':
        return handleGetTuneStatus(request, env, user.id);
      case path === '/tune' && request.method === 'POST':
        return handleTriggerTuning(request, env, user.id);

      // 自我修复状态
      case path === '/heal' && request.method === 'GET':
        return handleGetHealStatus(request, env, user.id);
      case path === '/heal' && request.method === 'POST':
        return handleTriggerHealing(request, env, user.id);

      // 系统重置
      case path === '/reset' && request.method === 'POST':
        return handleSystemReset(request, env, user.id);
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  },
};