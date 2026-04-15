/**
 * Common Type Definitions for Nexus Edge Workers
 */

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;
export interface JsonObject {
  [key: string]: JsonValue;
}

export interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException?(): void;
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

export interface AnalyticsEngineDatasetLike {
  writeDataPoint(data: { blobs?: string[]; doubles?: number[]; indexes?: string[] }): Promise<void>;
  query(sql: string): Promise<Record<string, unknown>>;
}

export interface ServiceUrls {
  nexusLiteUrl: string;
}

export interface WorkerEnv {
  NEXUS_LITE_URL: string;
  ENVIRONMENT?: 'development' | 'staging' | 'production' | string;
  ENABLE_CACHE?: string;

  // Storage bindings (matched with wrangler.toml)
  CONTENT_CACHE_KV: KVNamespaceLike;
  /** Optional frontend origin to allow for CORS (in addition to localhost + legacy Pages + extras). */
  FRONTEND_URL?: string;
  /** Comma-separated browser origins allowed in addition to localhost + legacy reader + FRONTEND_URL */
  CORS_EXTRA_ORIGINS?: string;
}
