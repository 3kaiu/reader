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

export interface WorkerEnv {
  NEXUS_LITE_URL: string;
  CF_BYPASS_URL: string;
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
