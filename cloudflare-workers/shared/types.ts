/**
 * Common Type Definitions for Nexus Reader Workers
 */

export type EntityCategory = 'person' | 'company' | 'place' | 'event' | 'organization';
export type BookType = 'era' | 'entertainment' | 'urban' | 'history' | 'business';
export type DecodeSource = 'dictionary' | 'rule' | 'knowledge_graph' | 'ai' | 'ai_cache';
export type DictionaryLevel = 'global' | 'category' | 'book';
export type EntrySource = 'system' | 'user' | 'ai' | 'community';
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

export interface BookMeta {
  type: BookType;
  era?: string;
  tags?: string[];
}

export interface Candidate {
  real: string;
  confidence: number;
  category: EntityCategory | string;
  reasoning?: string;
  evidence?: string[];
}

export interface DecodedEntity {
  id: string;
  original: string;
  position: { start: number; end: number };
  candidates: Candidate[];
  bestMatch: Candidate;
  source: DecodeSource | string;
}

export interface ChapterContext {
  timeContext: {
    era?: string;
    specificDate?: string;
    confidence: number;
  };
  locationContext: {
    city?: string;
    specificPlace?: string;
    confidence: number;
  };
  industryContext: string[];
  identifiedEntities: Array<
    string | {
      entityId: string;
      mentions: string[];
      lastMentionPosition: number;
    }
  >;
}

export interface DictionaryEntry {
  id: string;
  original: string;
  real: string;
  category: EntityCategory | string;
  aliases?: string[];
  description?: string;
  level?: DictionaryLevel;
  categoryTags?: BookType[];
  eraRange?: [number, number];
  bookId?: string;
  confidence?: number;
  confirmCount?: number;
  source?: EntrySource;
  createdAt?: number;
  updatedAt?: number;
}

export interface EntryConfirmation {
  totalConfirmCount: number;
  confirmedInBooks: number;
  threshold: number;
}

export interface Progress {
  bookId: string;
  chapterIndex: number;
  scrollPercent: number;
  updatedAt: number;
}

export interface ServiceUrls {
  nexusLiteUrl: string;
  cfBypassUrl: string;
}

export interface DecodeRequest {
  url: string;
  source?: string;
  content?: string;
  type?: 'html' | 'text' | 'json';
  options?: JsonObject;
  bookId?: string;
  chapterId?: string;
  bookMeta?: BookMeta;
}

export interface DecodeResponse {
  chapterId?: string;
  entities: DecodedEntity[];
  context: ChapterContext;
  cached: boolean;
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
  CF_BYPASS_URL: string;
  CF_API_KEY?: string;
  ENVIRONMENT?: 'development' | 'staging' | 'production' | string;
  LOG_LEVEL?: 'debug' | 'info' | 'warn' | 'error' | string;
  ENABLE_ANALYTICS?: string;
  ENABLE_CACHE?: string;
  ENABLE_EDGE_EXPERIMENTAL?: string;
  EDGE_EXPERIMENTAL_ROUTES?: string;
  EDGE_EXPERIMENTAL_EXCLUDE_ROUTES?: string;
  EDGE_EXPERIMENTAL_ROLLOUT?: string;

  // Storage bindings (matched with wrangler.toml)
  ANALYTICS_DB: D1DatabaseLike;
  USER_PREFERENCES_DB: D1DatabaseLike;
  USER_CONTENT_R2: R2BucketLike;
  BACKUP_R2: R2BucketLike;
  PROGRESS_KV: KVNamespaceLike;
  CONTENT_CACHE_KV: KVNamespaceLike;
  DECODER_KV: KVNamespaceLike;
  AI_CACHE_KV: KVNamespaceLike;
  ANALYTICS_QUEUE: QueueLike;
  ANALYTICS_ENGINE: AnalyticsEngineDatasetLike;
  AI?: AiBindingLike;

  // Secrets and Config
  AUTH_SECRET: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GITHUB_OWNER: string;
  FRONTEND_URL: string;
  WORKER_URL: string;
  
  // Optional/AI Config
  GROQ_API_KEY?: string;
  HF_API_KEY?: string;
  ctx?: ExecutionContextLike;
}
