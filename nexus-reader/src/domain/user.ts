/**
 * User Domain Layer
 *
 * Defines user-related business logic and entities
 */

import { reactive } from 'vue'

export interface User {
  id: string
  username: string
  email: string
  displayName?: string
  avatarUrl?: string
  status: UserStatus
  role: UserRole
  preferences: UserPreferences
  profile: UserProfile
  securityInfo: SecurityInfo
  createdAt: Date
  updatedAt: Date
  lastLoginAt?: Date
}

export type UserStatus = 'active' | 'inactive' | 'suspended' | 'deleted'
export type UserRole = 'reader' | 'premiumReader' | 'moderator' | 'administrator'

export interface UserPreferences {
  theme: 'light' | 'dark' | 'auto'
  language: string
  readingSettings: ReadingSettings
  notificationSettings: NotificationSettings
  privacySettings: PrivacySettings
}

export interface ReadingSettings {
  fontSize: number
  lineHeight: number
  fontFamily: string
  backgroundColor: string
  textColor: string
  enableAnimations: boolean
  autoSaveProgress: boolean
}

export interface NotificationSettings {
  emailNotifications: boolean
  pushNotifications: boolean
  readingReminders: boolean
  newBookAlerts: boolean
  systemUpdates: boolean
}

export interface PrivacySettings {
  profileVisibility: 'public' | 'friends' | 'private'
  readingHistoryVisibility: 'public' | 'friends' | 'private'
  allowAnalytics: boolean
  allowPersonalization: boolean
}

export interface UserProfile {
  bio?: string
  location?: string
  website?: string
  socialLinks: SocialLinks
  readingStats: ReadingStats
  achievements: Achievement[]
}

export interface SocialLinks {
  twitter?: string
  github?: string
  discord?: string
  wechat?: string
}

export interface ReadingStats {
  totalBooksRead: number
  totalReadingTime: number
  averageSessionTime: number
  favoriteGenres: string[]
  readingStreak: number
  longestStreak: number
}

export interface Achievement {
  id: string
  name: string
  description: string
  icon: string
  unlockedAt: Date
  rarity: 'common' | 'rare' | 'epic' | 'legendary'
}

export interface SecurityInfo {
  passwordLastChanged: Date
  twoFactorEnabled: boolean
  loginAttempts: number
  lastFailedLogin?: Date
  securityQuestions: SecurityQuestion[]
}

export interface SecurityQuestion {
  id: string
  question: string
  answerHash: string
}

export interface UserSession {
  id: string
  userId: string
  token: string
  expiresAt: Date
  createdAt: Date
  deviceInfo: DeviceInfo
  isActive: boolean
}

export interface DeviceInfo {
  userAgent: string
  ipAddress: string
  deviceType: 'mobile' | 'tablet' | 'desktop' | 'unknown'
  browser?: string
  os?: string
}

export interface LoginCredentials {
  usernameOrEmail: string
  password: string
  rememberMe?: boolean
}

export interface RegistrationData {
  username: string
  email: string
  password: string
  displayName?: string
}

// User domain state
const userState = reactive({
  currentUser: null as User | null,
  session: null as UserSession | null,
  isAuthenticated: false,
  isLoading: false,
  loginAttempts: 0
})

// Export reactive state
export { userState }

// Export types
export type {
  User,
  UserStatus,
  UserRole,
  UserPreferences,
  ReadingSettings,
  NotificationSettings,
  PrivacySettings,
  UserProfile,
  SocialLinks,
  ReadingStats,
  Achievement,
  SecurityInfo,
  SecurityQuestion,
  UserSession,
  DeviceInfo,
  LoginCredentials,
  RegistrationData
}