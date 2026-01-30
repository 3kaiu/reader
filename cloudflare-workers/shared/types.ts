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

// ============================================
// 通讯协议 (Bypass Protocol)
// ============================================

export interface BypassRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
  proxy?: string;
  engine?: 'scraper' | 'mesh';
}

export interface BypassResponse {
  status: number;
  html: string;
  cookies: Record<string, string>;
  headers: Record<string, string>;
  cf_bypassed: boolean;
  error?: string;
  engine_used: string;
}

export interface WorkerEnv {
  NEXUS_LITE_URL: string;
  CF_BYPASS_URL: string;
  CF_API_KEY?: string; // 增加 API Key 支持
  AUTH_SECRET: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GITHUB_OWNER: string;
  FRONTEND_URL: string;
  WORKER_URL: string;
  PROGRESS_KV?: any;
  CONTENT_CACHE_KV?: any;
  DECODER_KV?: any;
  ctx?: any;
}
