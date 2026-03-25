/**
 * Cloudflare Workers 领域层 (Domain Layer)
 *
 * 这是边缘计算环境的DDD架构领域层，专门为Cloudflare Workers设计：
 * - 轻量级实现，适应边缘计算资源限制
 * - 异步优先，支持Durable Objects
 * - 缓存友好，支持KV存储
 * - 事件驱动，支持Queues
 */

import type { ExecutionContextLike } from '../../shared/types.ts';

type DomainMetadata = Record<string, unknown>;

// ===== 领域基础类 =====

/**
 * 领域实体接口（轻量级版本）
 */
export interface Entity {
  id: string;
  version: number;
  createdAt: number; // 时间戳
  updatedAt: number;
}

/**
 * 聚合根接口（轻量级版本）
 */
export interface AggregateRoot extends Entity {
  uncommittedEvents: DomainEvent[];
  addDomainEvent(event: DomainEvent): void;
  getUncommittedEvents(): DomainEvent[];
  clearUncommittedEvents(): void;
}

/**
 * 值对象接口
 */
export interface ValueObject {
  equals(other: ValueObject): boolean;
}

/**
 * 领域事件（轻量级版本）
 */
export interface DomainEvent {
  eventId: string;
  eventType: string;
  timestamp: number;
  aggregateId: string;
  eventData: DomainMetadata;
}

/**
 * 领域上下文（轻量级版本）
 */
export interface DomainContext {
  userId?: string;
  sessionId?: string;
  correlationId: string;
  timestamp: number;
  metadata: DomainMetadata;
  requestId?: string;
}

/**
 * 领域结果（轻量级版本）
 */
export interface DomainResult<T = unknown> {
  success: boolean;
  data?: T;
  events: DomainEvent[];
  metadata: DomainMetadata;
  executionTimeMs: number;
}

/**
 * 领域错误（轻量级版本）
 */
export class DomainError extends Error {
  constructor(
    message: string,
    public code: string,
    public category: string
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

// ===== 缓存相关接口 =====

/**
 * KV缓存接口
 */
export interface KVCache {
  get<T>(key: string): Promise<T | null>;
  put<T>(key: string, value: T, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
}

/**
 * Durable Object 存储接口
 */
export interface DurableStorage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  list(): Promise<Map<string, unknown>>;
}

// ===== 业务规则验证器 =====

export interface BusinessRuleValidator<T> {
  ruleName: string;
  validate(entity: T, context: DomainContext): Promise<void> | void;
  description: string;
}

// ===== 领域服务接口 =====

export interface DomainService {
  name: string;
  execute(context: DomainContext): Promise<DomainResult>;
}

// ===== 边缘计算特定接口 =====

/**
 * 请求处理服务
 */
export interface RequestHandler<TEnv = unknown, TContext = ExecutionContextLike> {
  handle(request: Request, env: TEnv, ctx: TContext): Promise<Response>;
}

/**
 * 缓存策略
 */
export interface CacheStrategy {
  shouldCache(request: Request): boolean;
  getCacheKey(request: Request): string;
  getCacheTtl(request: Request): number;
}

/**
 * 速率限制器
 */
export interface RateLimiter {
  checkLimit(identifier: string, limit: number, windowMs: number): Promise<boolean>;
  recordRequest(identifier: string): Promise<void>;
}

// ===== 领域层配置 =====

export interface EdgeDomainConfig {
  enableDomainEvents: boolean;
  enableCaching: boolean;
  cacheTtlSeconds: number;
  enableRateLimiting: boolean;
  rateLimitRequests: number;
  rateLimitWindowMs: number;
  enableRequestLogging: boolean;
}

// ===== 默认配置 =====

export const defaultEdgeDomainConfig: EdgeDomainConfig = {
  enableDomainEvents: true,
  enableCaching: true,
  cacheTtlSeconds: 300, // 5分钟
  enableRateLimiting: true,
  rateLimitRequests: 100,
  rateLimitWindowMs: 60000, // 1分钟
  enableRequestLogging: true,
};

// ===== 处理结果类型 =====

export interface EdgeResponse {
  status: number;
  headers: Record<string, string>;
  body?: string | ArrayBuffer | ReadableStream;
  metadata?: DomainMetadata;
}

export interface EdgeRequestContext {
  requestId: string;
  userId?: string;
  ip: string;
  userAgent: string;
  timestamp: number;
  path: string;
  method: string;
}

// ===== 工具函数 =====

/**
 * 生成请求ID
 */
export function generateRequestId(): string {
  return crypto.randomUUID();
}

/**
 * 创建领域上下文
 */
export function createDomainContext(
  request: Request,
  userId?: string,
  metadata: DomainMetadata = {}
): DomainContext {
  return {
    userId,
    correlationId: generateRequestId(),
    timestamp: Date.now(),
    metadata,
  };
}

/**
 * 创建请求上下文
 */
export function createRequestContext(request: Request): EdgeRequestContext {
  const url = new URL(request.url);

  return {
    requestId: generateRequestId(),
    ip: request.headers.get('CF-Connecting-IP') ||
      request.headers.get('X-Forwarded-For') ||
      'unknown',
    userAgent: request.headers.get('User-Agent') || 'unknown',
    timestamp: Date.now(),
    path: url.pathname,
    method: request.method,
  };
}

/**
 * 格式化响应
 */
export function formatResponse(result: DomainResult, status: number = 200): EdgeResponse {
  const requestId =
    typeof result.metadata.requestId === 'string' ? result.metadata.requestId : 'unknown';
  const errorMessage =
    typeof result.metadata.error === 'string' ? result.metadata.error : 'Unknown error';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Execution-Time': result.executionTimeMs.toString(),
    'X-Request-Id': requestId,
  };

  if (result.success) {
    return {
      status,
      headers,
      body: JSON.stringify({
        success: true,
        data: result.data,
        metadata: result.metadata,
      }),
    };
  } else {
    return {
      status: 400,
      headers,
      body: JSON.stringify({
        success: false,
        error: errorMessage,
        metadata: result.metadata,
      }),
    };
  }
}
