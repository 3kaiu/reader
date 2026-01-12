/**
 * 🔐 Secure Communication Hook
 * React hook for managing secure API communications and encryption
 * **Feature: free-tier-maximization, Property 22: End-to-End Encryption**
 * **Feature: free-tier-maximization, Property 24: Secure Authentication**
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { secureComm, SecureCommUtils, SecureResponse } from '../utils/secureComm'

// Hook state interface
export interface SecureCommState {
  isInitialized: boolean
  isSecure: boolean
  hasSession: boolean
  canEncrypt: boolean
  isLoading: boolean
  error: string | null
  lastActivity: number
}

// Request options
export interface SecureRequestOptions {
  encrypt?: boolean
  authenticate?: boolean
  integrity?: boolean
  retries?: number
  timeout?: number
}

// Hook return type
export interface UseSecureCommReturn {
  state: SecureCommState
  initialize: (userId: string, password: string) => Promise<boolean>
  get: <T = any>(endpoint: string, options?: SecureRequestOptions) => Promise<SecureResponse<T>>
  post: <T = any>(endpoint: string, data: any, options?: SecureRequestOptions) => Promise<SecureResponse<T>>
  put: <T = any>(endpoint: string, data: any, options?: SecureRequestOptions) => Promise<SecureResponse<T>>
  delete: <T = any>(endpoint: string, options?: SecureRequestOptions) => Promise<SecureResponse<T>>
  uploadFile: (endpoint: string, file: File, userKey: string, metadata?: any) => Promise<SecureResponse>
  downloadFile: (endpoint: string, userKey: string) => Promise<SecureResponse<{ content: string; metadata: any }>>
  syncUserData: (endpoint: string, data: any, userKey: string) => Promise<SecureResponse>
  logout: () => Promise<void>
  refreshSession: () => Promise<boolean>
  clearError: () => void
}

// Default request options
const DEFAULT_OPTIONS: SecureRequestOptions = {
  encrypt: true,
  authenticate: true,
  integrity: true,
  retries: 3,
  timeout: 30000
}

/**
 * Hook for secure communication management
 */
export function useSecureComm(): UseSecureCommReturn {
  const [state, setState] = useState<SecureCommState>({
    isInitialized: false,
    isSecure: false,
    hasSession: false,
    canEncrypt: false,
    isLoading: false,
    error: null,
    lastActivity: 0
  })

  const timeoutRef = useRef<NodeJS.Timeout>()
  const sessionCheckRef = useRef<NodeJS.Timeout>()

  // Update security status
  const updateSecurityStatus = useCallback(() => {
    const status = SecureCommUtils.getSecurityStatus()
    setState(prev => ({
      ...prev,
      isSecure: status.isSecure,
      hasSession: status.hasSession,
      canEncrypt: status.canEncrypt,
      lastActivity: Date.now()
    }))
  }, [])

  // Initialize secure communication
  const initialize = useCallback(async (userId: string, password: string): Promise<boolean> => {
    setState(prev => ({ ...prev, isLoading: true, error: null }))

    try {
      const success = await SecureCommUtils.initializeForUser(userId, password)
      
      setState(prev => ({
        ...prev,
        isInitialized: success,
        isLoading: false,
        error: success ? null : 'Failed to initialize secure communication'
      }))

      if (success) {
        updateSecurityStatus()
        startSessionMonitoring()
      }

      return success
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Initialization failed'
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage
      }))
      return false
    }
  }, [updateSecurityStatus])

  // Generic secure request wrapper
  const makeSecureRequest = useCallback(async <T = any>(
    requestFn: () => Promise<SecureResponse<T>>,
    options: SecureRequestOptions = {}
  ): Promise<SecureResponse<T>> => {
    const opts = { ...DEFAULT_OPTIONS, ...options }
    setState(prev => ({ ...prev, isLoading: true, error: null }))

    try {
      // Set timeout
      const timeoutPromise = new Promise<SecureResponse<T>>((_, reject) => {
        timeoutRef.current = setTimeout(() => {
          reject(new Error('Request timeout'))
        }, opts.timeout)
      })

      // Make request with timeout
      const requestPromise = requestFn()
      const response = await Promise.race([requestPromise, timeoutPromise])

      // Clear timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }

      setState(prev => ({
        ...prev,
        isLoading: false,
        error: response.success ? null : response.error || 'Request failed'
      }))

      updateSecurityStatus()
      return response
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Request failed'
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage
      }))

      return {
        success: false,
        error: errorMessage,
        encrypted: false,
        timestamp: Date.now()
      }
    }
  }, [updateSecurityStatus])

  // GET request
  const get = useCallback(<T = any>(
    endpoint: string, 
    options: SecureRequestOptions = {}
  ): Promise<SecureResponse<T>> => {
    return makeSecureRequest(() => secureComm.get<T>(endpoint, {
      encrypt: options.encrypt ?? false,
      authenticate: options.authenticate ?? true,
      integrity: options.integrity ?? false
    }), options)
  }, [makeSecureRequest])

  // POST request
  const post = useCallback(<T = any>(
    endpoint: string, 
    data: any, 
    options: SecureRequestOptions = {}
  ): Promise<SecureResponse<T>> => {
    return makeSecureRequest(() => secureComm.post<T>(endpoint, data, {
      encrypt: options.encrypt ?? true,
      authenticate: options.authenticate ?? true,
      integrity: options.integrity ?? true
    }), options)
  }, [makeSecureRequest])

  // PUT request
  const put = useCallback(<T = any>(
    endpoint: string, 
    data: any, 
    options: SecureRequestOptions = {}
  ): Promise<SecureResponse<T>> => {
    return makeSecureRequest(() => secureComm.put<T>(endpoint, data, {
      encrypt: options.encrypt ?? true,
      authenticate: options.authenticate ?? true,
      integrity: options.integrity ?? true
    }), options)
  }, [makeSecureRequest])

  // DELETE request
  const deleteRequest = useCallback(<T = any>(
    endpoint: string, 
    options: SecureRequestOptions = {}
  ): Promise<SecureResponse<T>> => {
    return makeSecureRequest(() => secureComm.delete<T>(endpoint, {
      encrypt: options.encrypt ?? false,
      authenticate: options.authenticate ?? true,
      integrity: options.integrity ?? false
    }), options)
  }, [makeSecureRequest])

  // Upload file
  const uploadFile = useCallback((
    endpoint: string, 
    file: File, 
    userKey: string, 
    metadata?: any
  ): Promise<SecureResponse> => {
    return makeSecureRequest(() => secureComm.uploadFile(endpoint, file, userKey, metadata))
  }, [makeSecureRequest])

  // Download file
  const downloadFile = useCallback((
    endpoint: string, 
    userKey: string
  ): Promise<SecureResponse<{ content: string; metadata: any }>> => {
    return makeSecureRequest(() => secureComm.downloadFile(endpoint, userKey))
  }, [makeSecureRequest])

  // Sync user data
  const syncUserData = useCallback((
    endpoint: string, 
    data: any, 
    userKey: string
  ): Promise<SecureResponse> => {
    return makeSecureRequest(() => secureComm.syncUserData(endpoint, data, userKey))
  }, [makeSecureRequest])

  // Logout
  const logout = useCallback(async (): Promise<void> => {
    setState(prev => ({ ...prev, isLoading: true }))

    try {
      await secureComm.logout()
      stopSessionMonitoring()
      
      setState({
        isInitialized: false,
        isSecure: false,
        hasSession: false,
        canEncrypt: false,
        isLoading: false,
        error: null,
        lastActivity: 0
      })
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Logout failed'
      }))
    }
  }, [])

  // Refresh session
  const refreshSession = useCallback(async (): Promise<boolean> => {
    setState(prev => ({ ...prev, isLoading: true, error: null }))

    try {
      const success = await secureComm.refreshSession()
      
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: success ? null : 'Session refresh failed'
      }))

      if (success) {
        updateSecurityStatus()
      } else {
        // Session expired, reset state
        setState(prev => ({
          ...prev,
          isInitialized: false,
          isSecure: false,
          hasSession: false,
          canEncrypt: false
        }))
      }

      return success
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Session refresh failed'
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage
      }))
      return false
    }
  }, [updateSecurityStatus])

  // Clear error
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }))
  }, [])

  // Start session monitoring
  const startSessionMonitoring = useCallback(() => {
    // Check session validity every 5 minutes
    sessionCheckRef.current = setInterval(async () => {
      if (state.hasSession) {
        const isValid = await refreshSession()
        if (!isValid) {
          stopSessionMonitoring()
        }
      }
    }, 5 * 60 * 1000)
  }, [state.hasSession, refreshSession])

  // Stop session monitoring
  const stopSessionMonitoring = useCallback(() => {
    if (sessionCheckRef.current) {
      clearInterval(sessionCheckRef.current)
      sessionCheckRef.current = undefined
    }
  }, [])

  // Initialize security status on mount
  useEffect(() => {
    updateSecurityStatus()
    
    // Check if there's an existing session
    const checkExistingSession = async () => {
      try {
        const status = SecureCommUtils.getSecurityStatus()
        if (status.hasSession) {
          const isValid = await refreshSession()
          if (isValid) {
            setState(prev => ({ ...prev, isInitialized: true }))
            startSessionMonitoring()
          }
        }
      } catch (error) {
        console.error('Failed to check existing session:', error)
      }
    }

    checkExistingSession()

    return () => {
      stopSessionMonitoring()
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [updateSecurityStatus, refreshSession, startSessionMonitoring, stopSessionMonitoring])

  // Auto-refresh session when it's about to expire
  useEffect(() => {
    if (state.hasSession && state.lastActivity > 0) {
      const timeSinceActivity = Date.now() - state.lastActivity
      const refreshThreshold = 20 * 60 * 1000 // 20 minutes
      
      if (timeSinceActivity > refreshThreshold) {
        refreshSession()
      }
    }
  }, [state.hasSession, state.lastActivity, refreshSession])

  return {
    state,
    initialize,
    get,
    post,
    put,
    delete: deleteRequest,
    uploadFile,
    downloadFile,
    syncUserData,
    logout,
    refreshSession,
    clearError
  }
}

// Utility hook for encrypted data operations
export function useEncryptedData() {
  const { state, syncUserData } = useSecureComm()

  const encryptAndSync = useCallback(async (
    endpoint: string,
    data: any,
    userKey: string
  ) => {
    if (!state.isSecure) {
      throw new Error('Secure communication not initialized')
    }

    return await syncUserData(endpoint, data, userKey)
  }, [state.isSecure, syncUserData])

  return {
    encryptAndSync,
    isReady: state.isSecure && state.canEncrypt
  }
}

// Export types
export type { SecureCommState, SecureRequestOptions, UseSecureCommReturn }