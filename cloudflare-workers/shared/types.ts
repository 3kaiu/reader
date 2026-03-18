/**
 * Common Type Definitions for Nexus Reader Workers
 */

export type EntityCategory = 'person' | 'company' | 'place' | 'event' | 'organization';
export type BookType = 'era' | 'entertainment' | 'urban' | 'history' | 'business';
export type DecodeSource = 'dictionary' | 'rule' | 'knowledge_graph' | 'ai';
export type DictionaryLevel = 'global' | 'category' | 'book';
export type EntrySource = 'system' | 'user' | 'ai' | 'community';

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
  options?: Record<string, any>;
}

// Fallback types for Cloudflare-specific globals to resolve build errors
// when @cloudflare/workers-types are not explicitly included in the environment.
export type D1DatabaseFallback = {
  prepare: (sql: string) => {
    bind: (...args: any[]) => {
      run: () => Promise<any>;
      first: () => Promise<any>;
      all: () => Promise<any>;
    }
  }
};

export type R2BucketFallback = {
  get: (key: string) => Promise<any>;
  put: (key: string, value: any, options?: any) => Promise<any>;
  delete: (key: string) => Promise<void>;
  list: (options?: any) => AsyncIterableIterator<any>;
};

export type KVNamespaceFallback = {
  get: (key: string, options?: any) => Promise<any>;
  put: (key: string, value: any, options?: any) => Promise<any>;
  delete: (key: string) => Promise<void>;
};

export type QueueFallback = {
  send: (message: any, options?: any) => Promise<void>;
};

export type AnalyticsEngineDatasetFallback = {
  writeDataPoint: (data: { blobs?: string[]; doubles?: number[]; indexes?: string[] }) => Promise<void>;
  query: (sql: string) => Promise<any>;
};

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
  ANALYTICS_DB: any | D1DatabaseFallback;
  USER_PREFERENCES_DB: any | D1DatabaseFallback;
  USER_CONTENT_R2: any | R2BucketFallback;
  BACKUP_R2: any | R2BucketFallback;
  PROGRESS_KV: any | KVNamespaceFallback;
  CONTENT_CACHE_KV: any | KVNamespaceFallback;
  DECODER_KV: any | KVNamespaceFallback;
  AI_CACHE_KV: any | KVNamespaceFallback;
  ANALYTICS_QUEUE: any | QueueFallback;
  ANALYTICS_ENGINE: any | AnalyticsEngineDatasetFallback;
  AI: any;

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
  ctx?: any;
}
