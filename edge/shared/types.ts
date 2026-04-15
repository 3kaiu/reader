/**
 * Common Type Definitions for Nexus Edge Workers
 */

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;
export interface JsonObject {
  [key: string]: JsonValue;
}

export interface AnalyticsQueueMessage {
  type: 'analytics_event';
  eventType: string;
  data: JsonObject;
  timestamp: string;
}

export interface BackupRequestQueueMessage {
  type: 'backup_request';
  userId: string;
  timestamp: string;
}

export type WorkerQueueMessage = AnalyticsQueueMessage | BackupRequestQueueMessage;

export interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException?(): void;
}

export interface QueueMessageLike<TBody = unknown> {
  body: TBody;
}

export interface QueueBatchLike<TBody = unknown> {
  messages: Array<QueueMessageLike<TBody>>;
}

export interface KVGetOptionsLike {
  type?: 'text' | 'json' | 'arrayBuffer' | 'stream';
  cacheTtl?: number;
}

export interface KVPutOptionsLike {
  expiration?: number;
  expirationTtl?: number;
  metadata?: JsonObject;
}

export interface KVNamespaceLike {
  get<T = string>(key: string, options?: KVGetOptionsLike): Promise<T | null>;
  put(
    key: string,
    value: string | ArrayBuffer | ArrayBufferView | ReadableStream,
    options?: KVPutOptionsLike
  ): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface D1PreparedStatementLike {
  bind(...args: unknown[]): {
    run(): Promise<unknown>;
    first<T extends Record<string, unknown> = Record<string, unknown>>(): Promise<T | null>;
    all<T extends Record<string, unknown> = Record<string, unknown>>(): Promise<{ results: T[] }>;
  };
}

export interface D1DatabaseLike {
  prepare(sql: string): D1PreparedStatementLike;
}

export interface R2HttpMetadataLike {
  contentType?: string;
}

export interface R2PutOptionsLike {
  httpMetadata?: R2HttpMetadataLike;
}

export interface R2ObjectLike {
  key: string;
  uploaded: Date;
}

export interface R2BucketLike {
  get(key: string): Promise<unknown>;
  put(
    key: string,
    value: string | ArrayBuffer | ArrayBufferView,
    options?: R2PutOptionsLike
  ): Promise<unknown>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string }): AsyncIterable<R2ObjectLike>;
}

export interface QueueLike {
  send(message: unknown, options?: JsonObject): Promise<void>;
}

export interface AnalyticsEngineDatasetLike {
  writeDataPoint(data: { blobs?: string[]; doubles?: number[]; indexes?: string[] }): Promise<void>;
  query(sql: string): Promise<Record<string, unknown>>;
}

export interface AiRunResponseLike {
  response?: string;
  usage?: {
    total_tokens?: number;
  };
  [key: string]: unknown;
}

export interface AiBindingLike {
  run(model: string, input: Record<string, unknown>): Promise<AiRunResponseLike>;
}

export interface TokenPayload {
  provider: string;
  id: string;
  name: string;
  avatar?: string;
  exp: number;
}

export interface Progress {
  bookId: string;
  chapterIndex: number;
  scrollPercent: number;
  /**
   * Scroll percentage semantics:
   * - `chapter`: percentage within current chapter range (preferred)
   * - `document`: percentage within full document (legacy)
   */
  scrollKind?: 'chapter' | 'document';
  /**
   * Client-provided timestamp (ms). Stored for debugging/telemetry only.
   * Ordering and conflict resolution uses the server-side `updatedAt`.
   */
  clientUpdatedAt?: number;
  /**
   * Alias for clarity on the read path. When returned by the progress service,
   * this equals `updatedAt` (server-side timestamp).
   */
  serverUpdatedAt?: number;
  updatedAt: number;
  /**
   * Idempotency marker for progress writes. The edge gateway and frontend attach
   * `X-Request-ID` to every request; the progress service persists the last one
   * it accepted to allow duplicate suppression and "at-least-once" retry safety.
   */
  lastRequestId?: string;
}

export interface ServiceUrls {
  nexusLiteUrl: string;
}

// Fallback types for Cloudflare-specific globals to resolve build errors
// when @cloudflare/workers-types are not explicitly included in the environment.
export type D1DatabaseFallback = D1DatabaseLike;
export type R2BucketFallback = R2BucketLike;
export type KVNamespaceFallback = KVNamespaceLike;
export type QueueFallback = QueueLike;
export type AnalyticsEngineDatasetFallback = AnalyticsEngineDatasetLike;

export interface WorkerEnv {
  NEXUS_LITE_URL: string;
  ENVIRONMENT?: 'development' | 'staging' | 'production' | string;
  LOG_LEVEL?: 'debug' | 'info' | 'warn' | 'error' | string;
  ENABLE_CACHE?: string;

  // Storage bindings (matched with wrangler.toml)
  CONTENT_CACHE_KV: KVNamespaceLike;
  /** Optional frontend origin to allow for CORS (in addition to localhost + legacy Pages + extras). */
  FRONTEND_URL?: string;
  /** Comma-separated browser origins allowed in addition to localhost + legacy reader + FRONTEND_URL */
  CORS_EXTRA_ORIGINS?: string;
}
