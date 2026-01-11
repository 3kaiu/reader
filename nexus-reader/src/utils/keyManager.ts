/**
 * 🔑 Secure Key Management System
 * Manages encryption keys, authentication tokens, and secure storage
 * **Feature: free-tier-maximization, Property 22: End-to-End Encryption**
 * **Feature: free-tier-maximization, Property 24: Secure Authentication**
 */

import { encryptionManager, type EncryptedData } from './encryption'

// Key types
export type KeyType = 'user' | 'session' | 'device' | 'sync' | 'backup'

// Key metadata
export interface KeyMetadata {
  id: string
  type: KeyType
  created: number
  expires?: number
  lastUsed: number
  permissions: string[]
  deviceId?: string
  userId?: string
}

// Stored key information
export interface StoredKey {
  metadata: KeyMetadata
  encryptedKey: EncryptedData
  keyHash: string
  tokenData?: {
    keyId: string
    userId: string
    deviceId: string
    created: number
    expires: number
  }
}

// Key rotation policy
export interface KeyRotationPolicy {
  maxAge: number // Maximum key age in milliseconds
  rotationInterval: number // How often to check for rotation
  gracePeriod: number // Grace period for old keys
}

// Default key rotation policies
export const DEFAULT_KEY_POLICIES: Record<KeyType, KeyRotationPolicy> = {
  user: {
    maxAge: 90 * 24 * 60 * 60 * 1000, // 90 days
    rotationInterval: 24 * 60 * 60 * 1000, // Daily check
    gracePeriod: 7 * 24 * 60 * 60 * 1000 // 7 days grace
  },
  session: {
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    rotationInterval: 60 * 60 * 1000, // Hourly check
    gracePeriod: 2 * 60 * 60 * 1000 // 2 hours grace
  },
  device: {
    maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
    rotationInterval: 7 * 24 * 60 * 60 * 1000, // Weekly check
    gracePeriod: 30 * 24 * 60 * 60 * 1000 // 30 days grace
  },
  sync: {
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    rotationInterval: 24 * 60 * 60 * 1000, // Daily check
    gracePeriod: 3 * 24 * 60 * 60 * 1000 // 3 days grace
  },
  backup: {
    maxAge: 180 * 24 * 60 * 60 * 1000, // 180 days
    rotationInterval: 7 * 24 * 60 * 60 * 1000, // Weekly check
    gracePeriod: 14 * 24 * 60 * 60 * 1000 // 14 days grace
  }
}

// Secure key manager
export class KeyManager {
  private keys = new Map<string, StoredKey>()
  private rotationTimers = new Map<string, NodeJS.Timeout>()
  private masterKey: string | null = null
  private deviceId: string

  constructor() {
    this.deviceId = this.generateDeviceId()
    this.initializeKeyRotation()
  }

  /**
   * Initialize the key manager with a master key
   */
  async initialize(masterPassword: string): Promise<void> {
    this.masterKey = await encryptionManager.hashData(`${masterPassword}:${this.deviceId}`)
    await this.loadStoredKeys()
  }

  /**
   * Generate a unique device ID
   */
  private generateDeviceId(): string {
    // Check if localStorage is available (browser environment)
    if (typeof localStorage !== 'undefined') {
      // Try to get existing device ID from localStorage
      let deviceId = localStorage.getItem('nexus-device-id')
      
      if (!deviceId) {
        // Generate new device ID
        const timestamp = Date.now().toString(36)
        const random = Math.random().toString(36).substring(2)
        deviceId = `device-${timestamp}-${random}`
        localStorage.setItem('nexus-device-id', deviceId)
      }
      
      return deviceId
    } else {
      // Fallback for non-browser environments (tests, Node.js)
      const timestamp = Date.now().toString(36)
      const random = Math.random().toString(36).substring(2)
      return `device-${timestamp}-${random}`
    }
  }

  /**
   * Create a new encryption key
   */
  async createKey(
    type: KeyType, 
    userId?: string, 
    permissions: string[] = [],
    expiresIn?: number
  ): Promise<string> {
    if (!this.masterKey) {
      throw new Error('Key manager not initialized')
    }

    // Generate the actual encryption key
    const cryptoKey = await encryptionManager.generateKey()
    const keyData = await crypto.subtle.exportKey('raw', cryptoKey)
    const keyString = encryptionManager['arrayBufferToBase64'](keyData)

    // Create key metadata
    const keyId = await this.generateKeyId(type, userId)
    const now = Date.now()
    const metadata: KeyMetadata = {
      id: keyId,
      type,
      created: now,
      expires: expiresIn ? now + expiresIn : undefined,
      lastUsed: now,
      permissions,
      deviceId: this.deviceId,
      userId
    }

    // Encrypt the key with master key
    const encryptedKey = await encryptionManager.encryptWithPassword(keyString, this.masterKey)
    const keyHash = await encryptionManager.hashData(keyString)

    // Store the key
    const storedKey: StoredKey = {
      metadata,
      encryptedKey,
      keyHash
    }

    this.keys.set(keyId, storedKey)
    await this.persistKey(keyId, storedKey)
    this.scheduleKeyRotation(keyId, type)

    return keyId
  }

  /**
   * Retrieve a key by ID
   */
  async getKey(keyId: string): Promise<CryptoKey | null> {
    if (!this.masterKey) {
      throw new Error('Key manager not initialized')
    }

    const storedKey = this.keys.get(keyId)
    if (!storedKey) {
      return null
    }

    // Check if key is expired
    if (storedKey.metadata.expires && Date.now() > storedKey.metadata.expires) {
      await this.revokeKey(keyId)
      return null
    }

    try {
      // Decrypt the key
      const keyString = await encryptionManager.decryptWithPassword(
        storedKey.encryptedKey, 
        this.masterKey
      )

      // Import as CryptoKey
      const keyBuffer = encryptionManager['base64ToArrayBuffer'](keyString)
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyBuffer,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      )

      // Update last used timestamp
      storedKey.metadata.lastUsed = Date.now()
      await this.persistKey(keyId, storedKey)

      return cryptoKey
    } catch (error) {
      console.error('Failed to retrieve key:', error)
      return null
    }
  }

  /**
   * Rotate a key (create new version, keep old for grace period)
   */
  async rotateKey(keyId: string): Promise<string> {
    const storedKey = this.keys.get(keyId)
    if (!storedKey) {
      throw new Error(`Key ${keyId} not found`)
    }

    // Create new key with same metadata
    const newKeyId = await this.createKey(
      storedKey.metadata.type,
      storedKey.metadata.userId,
      storedKey.metadata.permissions
    )

    // Mark old key for deletion after grace period
    const policy = DEFAULT_KEY_POLICIES[storedKey.metadata.type]
    setTimeout(async () => {
      await this.revokeKey(keyId)
    }, policy.gracePeriod)

    return newKeyId
  }

  /**
   * Revoke a key (delete permanently)
   */
  async revokeKey(keyId: string): Promise<void> {
    this.keys.delete(keyId)
    
    // Clear rotation timer
    const timer = this.rotationTimers.get(keyId)
    if (timer) {
      clearTimeout(timer)
      this.rotationTimers.delete(keyId)
    }

    // Remove from persistent storage
    await this.removePersistedKey(keyId)
  }

  /**
   * List all keys with metadata
   */
  listKeys(type?: KeyType, userId?: string): KeyMetadata[] {
    const keys: KeyMetadata[] = []
    
    for (const storedKey of this.keys.values()) {
      if (type && storedKey.metadata.type !== type) continue
      if (userId && storedKey.metadata.userId !== userId) continue
      
      keys.push({ ...storedKey.metadata })
    }
    
    return keys.sort((a, b) => b.created - a.created)
  }

  /**
   * Check if a key has specific permission
   */
  hasPermission(keyId: string, permission: string): boolean {
    const storedKey = this.keys.get(keyId)
    if (!storedKey) return false
    
    return storedKey.metadata.permissions.includes(permission) || 
           storedKey.metadata.permissions.includes('*')
  }

  /**
   * Generate secure session token
   */
  async generateSessionToken(userId: string, permissions: string[] = [], expiresIn?: number): Promise<{
    token: string
    keyId: string
    expires: number
  }> {
    const expiration = expiresIn || 24 * 60 * 60 * 1000 // Default 24 hours
    
    // Create session key
    const keyId = await this.createKey('session', userId, permissions, expiration)
    
    // Generate session token using the actual keyId that was created
    const tokenData = {
      keyId,
      userId,
      deviceId: this.deviceId,
      created: Date.now(),
      expires: Date.now() + expiration
    }
    
    const token = await encryptionManager.hashData(JSON.stringify(tokenData))
    
    // Store the token data with the key for validation
    const storedKey = this.keys.get(keyId)
    if (storedKey) {
      storedKey.tokenData = tokenData
    }
    
    return {
      token,
      keyId,
      expires: tokenData.expires
    }
  }

  /**
   * Validate session token
   */
  async validateSessionToken(token: string): Promise<{
    valid: boolean
    keyId?: string
    userId?: string
  }> {
    // Find matching session key by comparing tokens
    for (const [keyId, storedKey] of this.keys.entries()) {
      if (storedKey.metadata.type !== 'session') continue
      
      // Use stored token data if available
      if (storedKey.tokenData) {
        const expectedToken = await encryptionManager.hashData(JSON.stringify(storedKey.tokenData))
        
        if (expectedToken === token) {
          // Check if token is expired
          if (Date.now() > storedKey.tokenData.expires) {
            await this.revokeKey(keyId)
            return { valid: false }
          }
          
          return {
            valid: true,
            keyId,
            userId: storedKey.tokenData.userId
          }
        }
      }
    }
    
    return { valid: false }
  }

  /**
   * Export keys for backup (encrypted)
   */
  async exportKeys(backupPassword: string): Promise<EncryptedData> {
    const keyData = {
      keys: Array.from(this.keys.entries()),
      deviceId: this.deviceId,
      exported: Date.now()
    }
    
    return await encryptionManager.encryptWithPassword(JSON.stringify(keyData), backupPassword)
  }

  /**
   * Import keys from backup
   */
  async importKeys(encryptedBackup: EncryptedData, backupPassword: string): Promise<void> {
    try {
      const keyDataString = await encryptionManager.decryptWithPassword(encryptedBackup, backupPassword)
      const keyData = JSON.parse(keyDataString)
      
      // Validate backup structure
      if (!keyData.keys || !Array.isArray(keyData.keys)) {
        throw new Error('Invalid backup format')
      }
      
      // Import keys
      for (const [keyId, storedKey] of keyData.keys) {
        this.keys.set(keyId, storedKey)
        await this.persistKey(keyId, storedKey)
        this.scheduleKeyRotation(keyId, storedKey.metadata.type)
      }
    } catch (error) {
      throw new Error(`Failed to import keys: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Clear all keys (for security)
   */
  async clearAllKeys(): Promise<void> {
    // Clear rotation timers
    for (const timer of this.rotationTimers.values()) {
      clearTimeout(timer)
    }
    this.rotationTimers.clear()
    
    // Clear keys
    this.keys.clear()
    
    // Clear persistent storage
    await this.clearPersistedKeys()
    
    // Clear master key
    this.masterKey = null
  }

  /**
   * Generate unique key ID
   */
  private async generateKeyId(type: KeyType, userId?: string): Promise<string> {
    const timestamp = Date.now().toString(36)
    const random = Math.random().toString(36).substring(2)
    const prefix = userId ? `${type}-${userId}` : type
    return `${prefix}-${timestamp}-${random}`
  }

  /**
   * Schedule automatic key rotation
   */
  private scheduleKeyRotation(keyId: string, type: KeyType): void {
    const policy = DEFAULT_KEY_POLICIES[type]
    
    const timer = setTimeout(async () => {
      try {
        await this.rotateKey(keyId)
      } catch (error) {
        console.error(`Failed to rotate key ${keyId}:`, error)
      }
    }, policy.rotationInterval)
    
    this.rotationTimers.set(keyId, timer)
  }

  /**
   * Initialize key rotation for all key types
   */
  private initializeKeyRotation(): void {
    // Check for expired keys every hour
    setInterval(async () => {
      await this.cleanupExpiredKeys()
    }, 60 * 60 * 1000)
  }

  /**
   * Cleanup expired keys
   */
  private async cleanupExpiredKeys(): Promise<void> {
    const now = Date.now()
    const expiredKeys: string[] = []
    
    for (const [keyId, storedKey] of this.keys.entries()) {
      if (storedKey.metadata.expires && now > storedKey.metadata.expires) {
        expiredKeys.push(keyId)
      }
    }
    
    for (const keyId of expiredKeys) {
      await this.revokeKey(keyId)
    }
  }

  /**
   * Persist key to secure storage
   */
  private async persistKey(keyId: string, storedKey: StoredKey): Promise<void> {
    try {
      const keyData = JSON.stringify(storedKey)
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(`nexus-key-${keyId}`, keyData)
      }
    } catch (error) {
      console.error('Failed to persist key:', error)
    }
  }

  /**
   * Load stored keys from persistent storage
   */
  private async loadStoredKeys(): Promise<void> {
    try {
      if (typeof localStorage !== 'undefined') {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key && key.startsWith('nexus-key-')) {
            const keyId = key.replace('nexus-key-', '')
            const keyData = localStorage.getItem(key)
            
            if (keyData) {
              const storedKey: StoredKey = JSON.parse(keyData)
              this.keys.set(keyId, storedKey)
              this.scheduleKeyRotation(keyId, storedKey.metadata.type)
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to load stored keys:', error)
    }
  }

  /**
   * Remove key from persistent storage
   */
  private async removePersistedKey(keyId: string): Promise<void> {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(`nexus-key-${keyId}`)
      }
    } catch (error) {
      console.error('Failed to remove persisted key:', error)
    }
  }

  /**
   * Clear all persisted keys
   */
  private async clearPersistedKeys(): Promise<void> {
    try {
      if (typeof localStorage !== 'undefined') {
        const keysToRemove: string[] = []
        
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key && key.startsWith('nexus-key-')) {
            keysToRemove.push(key)
          }
        }
        
        for (const key of keysToRemove) {
          localStorage.removeItem(key)
        }
      }
    } catch (error) {
      console.error('Failed to clear persisted keys:', error)
    }
  }
}

// Global key manager instance
export const keyManager = new KeyManager()

// Utility functions for common key management tasks
export const KeyUtils = {
  /**
   * Initialize key manager for user
   */
  async initializeForUser(userId: string, password: string): Promise<void> {
    const masterPassword = `${userId}:${password}:nexus-reader`
    await keyManager.initialize(masterPassword)
  },

  /**
   * Create user-specific encryption key
   */
  async createUserKey(userId: string): Promise<string> {
    return await keyManager.createKey('user', userId, ['encrypt', 'decrypt', 'sync'])
  },

  /**
   * Create device-specific key
   */
  async createDeviceKey(): Promise<string> {
    return await keyManager.createKey('device', undefined, ['device-sync', 'local-storage'])
  },

  /**
   * Create sync key for multi-device synchronization
   */
  async createSyncKey(userId: string): Promise<string> {
    return await keyManager.createKey('sync', userId, ['sync', 'conflict-resolution'])
  },

  /**
   * Authenticate user and create session
   */
  async authenticateUser(userId: string, password: string): Promise<{
    success: boolean
    sessionToken?: string
    keyId?: string
  }> {
    try {
      await KeyUtils.initializeForUser(userId, password)
      const session = await keyManager.generateSessionToken(userId, ['read', 'write', 'sync'])
      
      return {
        success: true,
        sessionToken: session.token,
        keyId: session.keyId
      }
    } catch (error) {
      return { success: false }
    }
  },

  /**
   * Validate user session
   */
  async validateUserSession(token: string): Promise<{
    valid: boolean
    userId?: string
    keyId?: string
  }> {
    return await keyManager.validateSessionToken(token)
  }
}