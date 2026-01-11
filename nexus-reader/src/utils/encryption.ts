/**
 * 🔐 End-to-End Encryption System
 * Provides comprehensive encryption capabilities for the Nexus Reader application
 * **Feature: free-tier-maximization, Property 22: End-to-End Encryption**
 * **Feature: free-tier-maximization, Property 23: Data Encryption at Rest**
 */

// Encryption configuration
export interface EncryptionConfig {
  algorithm: string
  keyLength: number
  ivLength: number
  tagLength: number
  iterations: number
  saltLength: number
}

// Default encryption configuration using AES-GCM
export const DEFAULT_ENCRYPTION_CONFIG: EncryptionConfig = {
  algorithm: 'AES-GCM',
  keyLength: 256,
  ivLength: 12,
  tagLength: 16,
  iterations: 100000,
  saltLength: 16
}

// Encrypted data structure
export interface EncryptedData {
  data: string // Base64 encoded encrypted data
  iv: string // Base64 encoded initialization vector
  salt: string // Base64 encoded salt
  tag: string // Base64 encoded authentication tag
  algorithm: string
  timestamp: number
}

// Key derivation result
export interface DerivedKey {
  key: CryptoKey
  salt: Uint8Array
}

// Encryption manager class
export class EncryptionManager {
  private config: EncryptionConfig
  private keyCache = new Map<string, CryptoKey>()

  constructor(config: EncryptionConfig = DEFAULT_ENCRYPTION_CONFIG) {
    this.config = config
  }

  /**
   * Generate a secure random password/passphrase
   */
  async generateSecurePassword(length: number = 32): Promise<string> {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*'
    const array = new Uint8Array(length)
    crypto.getRandomValues(array)
    
    return Array.from(array, byte => charset[byte % charset.length]).join('')
  }

  /**
   * Generate a cryptographically secure random key
   */
  async generateKey(): Promise<CryptoKey> {
    return await crypto.subtle.generateKey(
      {
        name: this.config.algorithm,
        length: this.config.keyLength
      },
      true, // extractable
      ['encrypt', 'decrypt']
    )
  }

  /**
   * Derive a key from a password using PBKDF2
   */
  async deriveKeyFromPassword(password: string, salt?: Uint8Array): Promise<DerivedKey> {
    // Generate salt if not provided
    if (!salt) {
      salt = new Uint8Array(this.config.saltLength)
      crypto.getRandomValues(salt)
    }

    // Import password as key material
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveKey']
    )

    // Derive the actual encryption key
    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt.buffer,
        iterations: this.config.iterations,
        hash: 'SHA-256'
      },
      keyMaterial,
      {
        name: this.config.algorithm,
        length: this.config.keyLength
      },
      false, // not extractable
      ['encrypt', 'decrypt']
    )

    return { key, salt }
  }

  /**
   * Encrypt data using AES-GCM
   */
  async encrypt(data: string, key: CryptoKey): Promise<EncryptedData> {
    // Generate random IV
    const iv = new Uint8Array(this.config.ivLength)
    crypto.getRandomValues(iv)

    // Encrypt the data
    const encodedData = new TextEncoder().encode(data)
    const encryptedBuffer = await crypto.subtle.encrypt(
      {
        name: this.config.algorithm,
        iv: iv
      },
      key,
      encodedData
    )

    // Extract encrypted data and authentication tag
    const encryptedArray = new Uint8Array(encryptedBuffer)
    const encryptedData = encryptedArray.slice(0, -this.config.tagLength)
    const tag = encryptedArray.slice(-this.config.tagLength)

    return {
      data: this.arrayBufferToBase64(encryptedData),
      iv: this.arrayBufferToBase64(iv),
      salt: '', // Will be set by caller if using password-derived key
      tag: this.arrayBufferToBase64(tag),
      algorithm: this.config.algorithm,
      timestamp: Date.now()
    }
  }

  /**
   * Decrypt data using AES-GCM
   */
  async decrypt(encryptedData: EncryptedData, key: CryptoKey): Promise<string> {
    // Decode base64 data
    const data = this.base64ToArrayBuffer(encryptedData.data)
    const iv = this.base64ToArrayBuffer(encryptedData.iv)
    const tag = this.base64ToArrayBuffer(encryptedData.tag)

    // Combine encrypted data and tag
    const combinedData = new Uint8Array(data.byteLength + tag.byteLength)
    combinedData.set(new Uint8Array(data))
    combinedData.set(new Uint8Array(tag), data.byteLength)

    try {
      // Decrypt the data
      const decryptedBuffer = await crypto.subtle.decrypt(
        {
          name: encryptedData.algorithm,
          iv: new Uint8Array(iv)
        },
        key,
        combinedData
      )

      return new TextDecoder().decode(decryptedBuffer)
    } catch (error) {
      throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Encrypt data with password
   */
  async encryptWithPassword(data: string, password: string): Promise<EncryptedData> {
    // Validate password - allow passwords with spaces, just check for empty/null
    if (!password || password.length === 0) {
      throw new Error('Invalid password: password cannot be empty')
    }
    
    const { key, salt } = await this.deriveKeyFromPassword(password)
    const encrypted = await this.encrypt(data, key)
    encrypted.salt = this.arrayBufferToBase64(salt)
    return encrypted
  }

  /**
   * Decrypt data with password
   */
  async decryptWithPassword(encryptedData: EncryptedData, password: string): Promise<string> {
    // Validate password - allow passwords with spaces, just check for empty/null
    if (!password || password.length === 0) {
      throw new Error('Invalid password: password cannot be empty')
    }
    
    const salt = this.base64ToArrayBuffer(encryptedData.salt)
    const { key } = await this.deriveKeyFromPassword(password, new Uint8Array(salt))
    return await this.decrypt(encryptedData, key)
  }

  /**
   * Encrypt sensitive user data (reading progress, bookmarks, preferences)
   */
  async encryptUserData(data: any, userKey: string): Promise<EncryptedData> {
    const jsonData = JSON.stringify(data)
    return await this.encryptWithPassword(jsonData, userKey)
  }

  /**
   * Decrypt sensitive user data
   */
  async decryptUserData<T>(encryptedData: EncryptedData, userKey: string): Promise<T> {
    const jsonData = await this.decryptWithPassword(encryptedData, userKey)
    return JSON.parse(jsonData)
  }

  /**
   * Generate a secure session key for temporary encryption
   */
  async generateSessionKey(): Promise<string> {
    const key = await this.generateKey()
    const exported = await crypto.subtle.exportKey('raw', key)
    return this.arrayBufferToBase64(exported)
  }

  /**
   * Import a session key from base64 string
   */
  async importSessionKey(keyData: string): Promise<CryptoKey> {
    const keyBuffer = this.base64ToArrayBuffer(keyData)
    return await crypto.subtle.importKey(
      'raw',
      keyBuffer,
      {
        name: this.config.algorithm,
        length: this.config.keyLength
      },
      false,
      ['encrypt', 'decrypt']
    )
  }

  /**
   * Secure key storage with caching
   */
  cacheKey(keyId: string, key: CryptoKey): void {
    this.keyCache.set(keyId, key)
    
    // Auto-expire keys after 1 hour
    setTimeout(() => {
      this.keyCache.delete(keyId)
    }, 60 * 60 * 1000)
  }

  /**
   * Retrieve cached key
   */
  getCachedKey(keyId: string): CryptoKey | undefined {
    return this.keyCache.get(keyId)
  }

  /**
   * Clear all cached keys (for security)
   */
  clearKeyCache(): void {
    this.keyCache.clear()
  }

  /**
   * Hash data using SHA-256 (for integrity verification)
   */
  async hashData(data: string): Promise<string> {
    const encodedData = new TextEncoder().encode(data)
    const hashBuffer = await crypto.subtle.digest('SHA-256', encodedData)
    return this.arrayBufferToBase64(hashBuffer)
  }

  /**
   * Hash data using SHA-256 and return as hex string
   */
  async hashDataHex(data: string): Promise<string> {
    const encodedData = new TextEncoder().encode(data)
    const hashBuffer = await crypto.subtle.digest('SHA-256', encodedData)
    return this.arrayBufferToHex(hashBuffer)
  }

  /**
   * Verify data integrity using hash
   */
  async verifyDataIntegrity(data: string, expectedHash: string): Promise<boolean> {
    const actualHash = await this.hashData(data)
    return actualHash === expectedHash
  }

  /**
   * Convert ArrayBuffer to Base64 string
   */
  private arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    
    // Use a more robust Base64 encoding that handles all byte values
    try {
      return btoa(binary)
    } catch (error) {
      // Fallback for environments where btoa might fail with certain characters
      return this.base64Encode(bytes)
    }
  }

  /**
   * Convert ArrayBuffer to hex string
   */
  private arrayBufferToHex(buffer: ArrayBuffer | Uint8Array): string {
    const bytes = new Uint8Array(buffer)
    return Array.from(bytes)
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('')
  }

  /**
   * Convert Base64 string to ArrayBuffer
   */
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    try {
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
      }
      return bytes.buffer
    } catch (error) {
      // Fallback for environments where atob might fail
      const bytes = this.base64Decode(base64)
      return bytes.buffer
    }
  }

  /**
   * Fallback Base64 encoding
   */
  private base64Encode(bytes: Uint8Array): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    let result = ''
    let i = 0
    
    while (i < bytes.length) {
      const a = bytes[i++]
      const b = i < bytes.length ? bytes[i++] : 0
      const c = i < bytes.length ? bytes[i++] : 0
      
      const bitmap = (a << 16) | (b << 8) | c
      
      result += chars.charAt((bitmap >> 18) & 63)
      result += chars.charAt((bitmap >> 12) & 63)
      result += i - 2 < bytes.length ? chars.charAt((bitmap >> 6) & 63) : '='
      result += i - 1 < bytes.length ? chars.charAt(bitmap & 63) : '='
    }
    
    return result
  }

  /**
   * Fallback Base64 decoding
   */
  private base64Decode(base64: string): Uint8Array {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    const lookup = new Uint8Array(256)
    
    for (let i = 0; i < chars.length; i++) {
      lookup[chars.charCodeAt(i)] = i
    }
    
    const len = base64.length
    let bufferLength = len * 0.75
    
    if (base64[len - 1] === '=') {
      bufferLength--
      if (base64[len - 2] === '=') {
        bufferLength--
      }
    }
    
    const bytes = new Uint8Array(bufferLength)
    let p = 0
    
    for (let i = 0; i < len; i += 4) {
      const encoded1 = lookup[base64.charCodeAt(i)]
      const encoded2 = lookup[base64.charCodeAt(i + 1)]
      const encoded3 = lookup[base64.charCodeAt(i + 2)]
      const encoded4 = lookup[base64.charCodeAt(i + 3)]
      
      bytes[p++] = (encoded1 << 2) | (encoded2 >> 4)
      if (p < bufferLength) bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2)
      if (p < bufferLength) bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63)
    }
    
    return bytes
  }
}

// Global encryption manager instance
export const encryptionManager = new EncryptionManager()

// Utility functions for common encryption tasks
export const EncryptionUtils = {
  /**
   * Encrypt reading progress data
   */
  async encryptReadingProgress(progress: any, userKey: string): Promise<EncryptedData> {
    return await encryptionManager.encryptUserData(progress, userKey)
  },

  /**
   * Decrypt reading progress data
   */
  async decryptReadingProgress(encryptedData: EncryptedData, userKey: string): Promise<any> {
    return await encryptionManager.decryptUserData(encryptedData, userKey)
  },

  /**
   * Encrypt user preferences
   */
  async encryptPreferences(preferences: any, userKey: string): Promise<EncryptedData> {
    return await encryptionManager.encryptUserData(preferences, userKey)
  },

  /**
   * Decrypt user preferences
   */
  async decryptPreferences(encryptedData: EncryptedData, userKey: string): Promise<any> {
    return await encryptionManager.decryptUserData(encryptedData, userKey)
  },

  /**
   * Encrypt bookmarks and notes
   */
  async encryptBookmarks(bookmarks: any, userKey: string): Promise<EncryptedData> {
    return await encryptionManager.encryptUserData(bookmarks, userKey)
  },

  /**
   * Decrypt bookmarks and notes
   */
  async decryptBookmarks(encryptedData: EncryptedData, userKey: string): Promise<any> {
    return await encryptionManager.decryptUserData(encryptedData, userKey)
  },

  /**
   * Generate a user-specific encryption key from their credentials
   */
  async generateUserKey(userId: string, password: string): Promise<string> {
    const combinedData = `${userId}:${password}:${Date.now()}`
    return await encryptionManager.hashData(combinedData)
  },

  /**
   * Secure data transmission preparation
   */
  async prepareSecureTransmission(data: any, sessionKey: string): Promise<{
    encryptedData: EncryptedData
    integrity: string
  }> {
    const key = await encryptionManager.importSessionKey(sessionKey)
    const jsonData = JSON.stringify(data)
    const encryptedData = await encryptionManager.encrypt(jsonData, key)
    const integrity = await encryptionManager.hashData(jsonData)
    
    return { encryptedData, integrity }
  },

  /**
   * Secure data transmission verification and decryption
   */
  async processSecureTransmission(
    encryptedData: EncryptedData, 
    sessionKey: string, 
    expectedIntegrity: string
  ): Promise<any> {
    const key = await encryptionManager.importSessionKey(sessionKey)
    const jsonData = await encryptionManager.decrypt(encryptedData, key)
    
    // Verify integrity
    const isValid = await encryptionManager.verifyDataIntegrity(jsonData, expectedIntegrity)
    if (!isValid) {
      throw new Error('Data integrity verification failed')
    }
    
    return JSON.parse(jsonData)
  }
}