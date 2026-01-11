/**
 * 🔒 Secure Communication Layer
 * Handles encrypted API communications and secure data transmission
 * **Feature: free-tier-maximization, Property 22: End-to-End Encryption**
 * **Feature: free-tier-maximization, Property 24: Secure Authentication**
 */

import { encryptionManager, type EncryptedData, EncryptionUtils } from './encryption'
import { keyManager, KeyUtils } from './keyManager'

// Request encryption configuration
export interface SecureRequestConfig {
  encrypt: boolean
  authenticate: boolean
  integrity: boolean
  sessionKey?: string
  userKey?: string
}

// Secure request/response wrapper
export interface SecureRequest {
  endpoint: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  data?: any
  headers?: Record<string, string>
  config: SecureRequestConfig
}

export interface SecureResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  encrypted: boolean
  integrity?: string
  timestamp: number
}

// Authentication header structure
export interface AuthHeaders {
  'Authorization': string
  'X-Device-ID': string
  'X-Session-Token': string
  'X-Integrity-Hash'?: string
  'X-Encryption-Method'?: string
}

// Secure communication manager
export class SecureCommunicationManager {
  private baseUrl: string
  private defaultHeaders: Record<string, string>
  private sessionToken: string | null = null
  private sessionKeyId: string | null = null

  constructor(baseUrl: string = '/api') {
    this.baseUrl = baseUrl
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      'X-Client-Version': '2.0.0',
      'X-Platform': 'web'
    }
  }

  /**
   * Initialize secure communication with user authentication
   */
  async initialize(userId: string, password: string): Promise<boolean> {
    try {
      // Initialize key manager
      await KeyUtils.initializeForUser(userId, password)
      
      // Authenticate and get session token
      const auth = await KeyUtils.authenticateUser(userId, password)
      if (!auth.success || !auth.sessionToken || !auth.keyId) {
        return false
      }
      
      this.sessionToken = auth.sessionToken
      this.sessionKeyId = auth.keyId
      
      return true
    } catch (error) {
      console.error('Failed to initialize secure communication:', error)
      return false
    }
  }

  /**
   * Make a secure API request
   */
  async request<T = any>(request: SecureRequest): Promise<SecureResponse<T>> {
    try {
      // Prepare request data
      let requestData = request.data
      let headers = { ...this.defaultHeaders, ...request.headers }
      let integrityHash: string | undefined

      // Add authentication headers if required
      if (request.config.authenticate) {
        const authHeaders = await this.getAuthHeaders()
        headers = { ...headers, ...authHeaders }
      }

      // Encrypt request data if required
      if (request.config.encrypt && requestData) {
        const sessionKey = request.config.sessionKey || await this.getSessionKey()
        if (!sessionKey) {
          throw new Error('No session key available for encryption')
        }

        const secureData = await EncryptionUtils.prepareSecureTransmission(requestData, sessionKey)
        requestData = secureData.encryptedData
        integrityHash = secureData.integrity

        headers['X-Encryption-Method'] = 'AES-GCM'
        if (integrityHash) {
          headers['X-Integrity-Hash'] = integrityHash
        }
      }

      // Make the HTTP request
      const response = await fetch(`${this.baseUrl}${request.endpoint}`, {
        method: request.method,
        headers,
        body: requestData ? JSON.stringify(requestData) : undefined,
        credentials: 'include'
      })

      // Parse response
      const responseData = await response.json()

      // Handle encrypted response
      if (responseData.encrypted && request.config.encrypt) {
        const sessionKey = request.config.sessionKey || await this.getSessionKey()
        if (!sessionKey) {
          throw new Error('No session key available for decryption')
        }

        const decryptedData = await EncryptionUtils.processSecureTransmission(
          responseData.data,
          sessionKey,
          responseData.integrity
        )

        return {
          success: response.ok,
          data: decryptedData,
          encrypted: true,
          integrity: responseData.integrity,
          timestamp: Date.now()
        }
      }

      return {
        success: response.ok,
        data: responseData,
        encrypted: false,
        timestamp: Date.now()
      }

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        encrypted: false,
        timestamp: Date.now()
      }
    }
  }

  /**
   * Secure GET request
   */
  async get<T = any>(
    endpoint: string, 
    config: Partial<SecureRequestConfig> = {}
  ): Promise<SecureResponse<T>> {
    return await this.request<T>({
      endpoint,
      method: 'GET',
      config: { encrypt: false, authenticate: true, integrity: false, ...config }
    })
  }

  /**
   * Secure POST request
   */
  async post<T = any>(
    endpoint: string, 
    data: any, 
    config: Partial<SecureRequestConfig> = {}
  ): Promise<SecureResponse<T>> {
    return await this.request<T>({
      endpoint,
      method: 'POST',
      data,
      config: { encrypt: true, authenticate: true, integrity: true, ...config }
    })
  }

  /**
   * Secure PUT request
   */
  async put<T = any>(
    endpoint: string, 
    data: any, 
    config: Partial<SecureRequestConfig> = {}
  ): Promise<SecureResponse<T>> {
    return await this.request<T>({
      endpoint,
      method: 'PUT',
      data,
      config: { encrypt: true, authenticate: true, integrity: true, ...config }
    })
  }

  /**
   * Secure DELETE request
   */
  async delete<T = any>(
    endpoint: string, 
    config: Partial<SecureRequestConfig> = {}
  ): Promise<SecureResponse<T>> {
    return await this.request<T>({
      endpoint,
      method: 'DELETE',
      config: { encrypt: false, authenticate: true, integrity: false, ...config }
    })
  }

  /**
   * Upload encrypted file
   */
  async uploadFile(
    endpoint: string,
    file: File,
    userKey: string,
    metadata?: any
  ): Promise<SecureResponse> {
    try {
      // Read file content
      const fileContent = await this.readFileAsText(file)
      
      // Encrypt file content
      const encryptedContent = await encryptionManager.encryptWithPassword(fileContent, userKey)
      
      // Prepare upload data
      const uploadData = {
        filename: file.name,
        size: file.size,
        type: file.type,
        encryptedContent,
        metadata: metadata || {}
      }
      
      return await this.post(endpoint, uploadData, { encrypt: true, authenticate: true, integrity: true })
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Upload failed',
        encrypted: false,
        timestamp: Date.now()
      }
    }
  }

  /**
   * Download and decrypt file
   */
  async downloadFile(
    endpoint: string,
    userKey: string
  ): Promise<SecureResponse<{ content: string; metadata: any }>> {
    try {
      const response = await this.get(endpoint, { encrypt: true, authenticate: true })
      
      if (!response.success || !response.data) {
        return response
      }
      
      // Decrypt file content
      const decryptedContent = await encryptionManager.decryptWithPassword(
        response.data.encryptedContent,
        userKey
      )
      
      return {
        success: true,
        data: {
          content: decryptedContent,
          metadata: response.data.metadata
        },
        encrypted: true,
        timestamp: Date.now()
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Download failed',
        encrypted: false,
        timestamp: Date.now()
      }
    }
  }

  /**
   * Sync encrypted user data
   */
  async syncUserData(
    endpoint: string,
    data: any,
    userKey: string,
    conflictResolution: 'client' | 'server' | 'merge' = 'merge'
  ): Promise<SecureResponse> {
    try {
      // Encrypt user data
      const encryptedData = await EncryptionUtils.encryptUserData(data, userKey)
      
      // Add sync metadata
      const syncData = {
        encryptedData,
        timestamp: Date.now(),
        deviceId: keyManager['deviceId'],
        conflictResolution
      }
      
      return await this.post(endpoint, syncData, { 
        encrypt: true, 
        authenticate: true, 
        integrity: true 
      })
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Sync failed',
        encrypted: false,
        timestamp: Date.now()
      }
    }
  }

  /**
   * Get authentication headers
   */
  private async getAuthHeaders(): Promise<AuthHeaders> {
    if (!this.sessionToken) {
      throw new Error('No session token available')
    }

    const headers: AuthHeaders = {
      'Authorization': `Bearer ${this.sessionToken}`,
      'X-Device-ID': keyManager['deviceId'],
      'X-Session-Token': this.sessionToken
    }

    return headers
  }

  /**
   * Get current session key
   */
  private async getSessionKey(): Promise<string | null> {
    if (!this.sessionKeyId) {
      return null
    }

    try {
      const key = await keyManager.getKey(this.sessionKeyId)
      if (!key) {
        return null
      }

      // Export key as base64 string
      const keyData = await crypto.subtle.exportKey('raw', key)
      return encryptionManager['arrayBufferToBase64'](keyData)
    } catch (error) {
      console.error('Failed to get session key:', error)
      return null
    }
  }

  /**
   * Read file as text
   */
  private readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(reader.error)
      reader.readAsText(file)
    })
  }

  /**
   * Logout and clear session
   */
  async logout(): Promise<void> {
    this.sessionToken = null
    this.sessionKeyId = null
    await keyManager.clearAllKeys()
  }

  /**
   * Check if communication is secure
   */
  isSecure(): boolean {
    return this.sessionToken !== null && this.sessionKeyId !== null
  }

  /**
   * Refresh session token
   */
  async refreshSession(): Promise<boolean> {
    if (!this.sessionToken) {
      return false
    }

    try {
      const validation = await KeyUtils.validateUserSession(this.sessionToken)
      if (!validation.valid) {
        await this.logout()
        return false
      }

      return true
    } catch (error) {
      console.error('Failed to refresh session:', error)
      await this.logout()
      return false
    }
  }
}

// Global secure communication manager
export const secureComm = new SecureCommunicationManager()

// Utility functions for common secure operations
export const SecureCommUtils = {
  /**
   * Initialize secure communication for user
   */
  async initializeForUser(userId: string, password: string): Promise<boolean> {
    return await secureComm.initialize(userId, password)
  },

  /**
   * Secure API call with automatic retry
   */
  async secureApiCall<T = any>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    data?: any,
    retries: number = 3
  ): Promise<SecureResponse<T>> {
    let lastError: string | undefined

    for (let i = 0; i < retries; i++) {
      try {
        let response: SecureResponse<T>

        switch (method) {
          case 'GET':
            response = await secureComm.get<T>(endpoint)
            break
          case 'POST':
            response = await secureComm.post<T>(endpoint, data)
            break
          case 'PUT':
            response = await secureComm.put<T>(endpoint, data)
            break
          case 'DELETE':
            response = await secureComm.delete<T>(endpoint)
            break
        }

        if (response.success) {
          return response
        }

        lastError = response.error
        
        // If authentication failed, try to refresh session
        if (response.error?.includes('authentication') || response.error?.includes('unauthorized')) {
          const refreshed = await secureComm.refreshSession()
          if (!refreshed) {
            break // Don't retry if session refresh failed
          }
        }

        // Wait before retry
        if (i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000))
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown error'
      }
    }

    return {
      success: false,
      error: lastError || 'Max retries exceeded',
      encrypted: false,
      timestamp: Date.now()
    }
  },

  /**
   * Batch secure requests
   */
  async batchSecureRequests<T = any>(
    requests: Array<{
      endpoint: string
      method: 'GET' | 'POST' | 'PUT' | 'DELETE'
      data?: any
    }>
  ): Promise<SecureResponse<T>[]> {
    const promises = requests.map(req => 
      SecureCommUtils.secureApiCall<T>(req.endpoint, req.method, req.data)
    )

    return await Promise.all(promises)
  },

  /**
   * Check secure communication status
   */
  getSecurityStatus(): {
    isSecure: boolean
    hasSession: boolean
    canEncrypt: boolean
  } {
    return {
      isSecure: secureComm.isSecure(),
      hasSession: secureComm['sessionToken'] !== null,
      canEncrypt: secureComm['sessionKeyId'] !== null
    }
  }
}

// Export types
export type { 
  SecureRequestConfig, 
  SecureRequest, 
  SecureResponse, 
  AuthHeaders 
}