/**
 * Unified Type Definitions
 *
 * Common type definitions used across all stores
 */

export interface User {
  id: string;
  username: string;
  email: string;
  displayName?: string;
  avatar?: string;
  role: "reader" | "premium" | "admin";
  createdAt: Date;
  lastLoginAt?: Date;
}

export interface UserPreferences {
  theme: "light" | "dark" | "auto";
  language: string;
  timezone: string;
  reading: ReadingSettings;
  notifications: NotificationSettings;
  privacy: PrivacySettings;
}

export interface LoginCredentials {
  username: string;
  password: string;
  remember?: boolean;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  cover?: string;
  description?: string;
  genres: string[];
  status: "ongoing" | "completed" | "hiatus";
  chapters: Chapter[];
  progress?: ReadingProgress;
}

export interface Chapter {
  id: string;
  title: string;
  content?: string;
  order: number;
  wordCount?: number;
}

export interface ReadingProgress {
  bookId: string;
  chapterId: string;
  position: number; // 0-100
  scrollTop: number;
  timestamp: number;
  completed: boolean;
}

export interface Bookmark {
  id: string;
  chapterId: string;
  position: number;
  note?: string;
  createdAt: Date;
}

export interface ReadingSettings {
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
  theme: "light" | "dark" | "auto";
  pageWidth: number;
  autoScroll: boolean;
  scrollSpeed: number;
}

export interface NotificationSettings {
  enabled: boolean;
  sound: boolean;
  desktop: boolean;
  email?: boolean;
}

export interface PrivacySettings {
  analytics: boolean;
  crashReports: boolean;
  usageData: boolean;
}

export interface AiMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  metadata?: Record<string, any>;
}
