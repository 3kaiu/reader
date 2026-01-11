/**
 * 🔐 Secure API Worker
 * Cloudflare Worker for handling encrypted API requests and secure data transmission
 * **Feature: free-tier-maximization, Property 22: End-to-End Encryption**
 * **Feature: free-tier-maximization, Property 24: Secure Authentication**
 */

// Encryption configuration
const ENCRYPTION_CONFIG = {
  algorithm: 'AES-GCM',
  keyLength: 256,
  ivLength: 12,
  tagLength: 16
}

// CORS headers
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Device-ID, X-Session-Token, X-Integrity-Hash, X-Encryption-Method',
  'Access-Control-Max-Age': '86400'
}

// Response headers
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'"
}

/**
 * Main worker request handler
 */
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

/**
 * Handle incoming requests
 */
async function handleRequest(request) {
  try {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: { ...CORS_HEADERS }
      })
    }

    // Parse request URL
    const url = new URL(request.url)
    const path = url.pathname

    // Route requests
    if (path.startsWith('/api/secure/')) {
      return await handleSecureApiRequest(request, path)
    } else if (path.startsWith('/api/auth/')) {
      return await handleAuthRequest(request, path)
    } else if (path.startsWith('/api/sync/')) {
      return await handleSyncRequest(request, path)
    } else {
      return createErrorResponse('Not Found', 404)
    }
  } catch (error) {
    console.error('Worker error:', error)
    return createErrorResponse('Internal Server Error', 500)
  }
}

/**
 * Handle secure API requests
 */
async function handleSecureApiRequest(request, path) {
  try {
    // Verify authentication
    const authResult = await verifyAuthentication(request)
    if (!authResult.valid) {
      return createErrorResponse('Unauthorized', 401)
    }

    // Parse request body
    const requestData = await parseRequestBody(request)
    
    // Check if request is encrypted
    const isEncrypted = request.headers.get('X-Encryption-Method') === 'AES-GCM'
    let decryptedData = requestData

    if (isEncrypted && requestData) {
      // Verify integrity if provided
      const integrityHash = request.headers.get('X-Integrity-Hash')
      if (integrityHash) {
        const isValid = await verifyIntegrity(requestData, integrityHash, authResult.sessionKey)
        if (!isValid) {
          return createErrorResponse('Integrity verification failed', 400)
        }
      }

      // Decrypt request data
      decryptedData = await decryptData(requestData, authResult.sessionKey)
    }

    // Process the API request based on path
    let responseData
    switch (path) {
      case '/api/secure/user/profile':
        responseData = await handleUserProfile(request.method, decryptedData, authResult.userId)
        break
      case '/api/secure/reading/progress':
        responseData = await handleReadingProgress(request.method, decryptedData, authResult.userId)
        break
      case '/api/secure/user/preferences':
        responseData = await handleUserPreferences(request.method, decryptedData, authResult.userId)
        break
      case '/api/secure/bookmarks':
        responseData = await handleBookmarks(request.method, decryptedData, authResult.userId)
        break
      default:
        return createErrorResponse('Endpoint not found', 404)
    }

    // Encrypt response if request was encrypted
    if (isEncrypted) {
      const encryptedResponse = await encryptData(responseData, authResult.sessionKey)
      const integrityHash = await calculateIntegrity(responseData, authResult.sessionKey)
      
      return createSuccessResponse({
        encrypted: true,
        data: encryptedResponse,
        integrity: integrityHash
      })
    }

    return createSuccessResponse(responseData)
  } catch (error) {
    console.error('Secure API error:', error)
    return createErrorResponse('Request processing failed', 500)
  }
}

/**
 * Handle authentication requests
 */
async function handleAuthRequest(request, path) {
  try {
    const requestData = await parseRequestBody(request)

    switch (path) {
      case '/api/auth/login':
        return await handleLogin(requestData)
      case '/api/auth/logout':
        return await handleLogout(request)
      case '/api/auth/refresh':
        return await handleRefreshToken(request)
      case '/api/auth/validate':
        return await handleValidateSession(request)
      default:
        return createErrorResponse('Auth endpoint not found', 404)
    }
  } catch (error) {
    console.error('Auth error:', error)
    return createErrorResponse('Authentication failed', 500)
  }
}

/**
 * Handle sync requests
 */
async function handleSyncRequest(request, path) {
  try {
    // Verify authentication
    const authResult = await verifyAuthentication(request)
    if (!authResult.valid) {
      return createErrorResponse('Unauthorized', 401)
    }

    const requestData = await parseRequestBody(request)

    switch (path) {
      case '/api/sync/upload':
        return await handleSyncUpload(requestData, authResult.userId)
      case '/api/sync/download':
        return await handleSyncDownload(requestData, authResult.userId)
      case '/api/sync/conflict':
        return await handleSyncConflict(requestData, authResult.userId)
      default:
        return createErrorResponse('Sync endpoint not found', 404)
    }
  } catch (error) {
    console.error('Sync error:', error)
    return createErrorResponse('Sync operation failed', 500)
  }
}

/**
 * Verify request authentication
 */
async function verifyAuthentication(request) {
  try {
    const authHeader = request.headers.get('Authorization')
    const sessionToken = request.headers.get('X-Session-Token')
    const deviceId = request.headers.get('X-Device-ID')

    if (!authHeader || !sessionToken || !deviceId) {
      return { valid: false }
    }

    // Extract bearer token
    const token = authHeader.replace('Bearer ', '')
    
    // Validate session token (in production, this would check against KV store)
    const sessionData = await validateSessionToken(sessionToken, deviceId)
    if (!sessionData.valid) {
      return { valid: false }
    }

    return {
      valid: true,
      userId: sessionData.userId,
      sessionKey: sessionData.sessionKey,
      deviceId: deviceId
    }
  } catch (error) {
    console.error('Authentication verification error:', error)
    return { valid: false }
  }
}

/**
 * Validate session token
 */
async function validateSessionToken(token, deviceId) {
  try {
    // In production, this would validate against KV store
    // For now, we'll simulate validation
    
    // Check if token format is valid
    if (!token || token.length < 32) {
      return { valid: false }
    }

    // Simulate session data retrieval
    const sessionKey = await generateSessionKey()
    
    return {
      valid: true,
      userId: 'user-123', // Would be extracted from token
      sessionKey: sessionKey
    }
  } catch (error) {
    console.error('Session validation error:', error)
    return { valid: false }
  }
}

/**
 * Generate session key
 */
async function generateSessionKey() {
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  )
  
  const keyData = await crypto.subtle.exportKey('raw', key)
  return arrayBufferToBase64(keyData)
}

/**
 * Encrypt data
 */
async function encryptData(data, sessionKey) {
  try {
    const keyBuffer = base64ToArrayBuffer(sessionKey)
    const key = await crypto.subtle.importKey(
      'raw',
      keyBuffer,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    )

    const iv = crypto.getRandomValues(new Uint8Array(ENCRYPTION_CONFIG.ivLength))
    const encodedData = new TextEncoder().encode(JSON.stringify(data))

    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      encodedData
    )

    const encryptedArray = new Uint8Array(encryptedBuffer)
    const encryptedData = encryptedArray.slice(0, -ENCRYPTION_CONFIG.tagLength)
    const tag = encryptedArray.slice(-ENCRYPTION_CONFIG.tagLength)

    return {
      data: arrayBufferToBase64(encryptedData),
      iv: arrayBufferToBase64(iv),
      tag: arrayBufferToBase64(tag),
      algorithm: ENCRYPTION_CONFIG.algorithm,
      timestamp: Date.now()
    }
  } catch (error) {
    console.error('Encryption error:', error)
    throw new Error('Encryption failed')
  }
}

/**
 * Decrypt data
 */
async function decryptData(encryptedData, sessionKey) {
  try {
    const keyBuffer = base64ToArrayBuffer(sessionKey)
    const key = await crypto.subtle.importKey(
      'raw',
      keyBuffer,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    )

    const data = base64ToArrayBuffer(encryptedData.data)
    const iv = base64ToArrayBuffer(encryptedData.iv)
    const tag = base64ToArrayBuffer(encryptedData.tag)

    // Combine encrypted data and tag
    const combinedData = new Uint8Array(data.byteLength + tag.byteLength)
    combinedData.set(new Uint8Array(data))
    combinedData.set(new Uint8Array(tag), data.byteLength)

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(iv) },
      key,
      combinedData
    )

    const decryptedText = new TextDecoder().decode(decryptedBuffer)
    return JSON.parse(decryptedText)
  } catch (error) {
    console.error('Decryption error:', error)
    throw new Error('Decryption failed')
  }
}

/**
 * Calculate data integrity hash
 */
async function calculateIntegrity(data, sessionKey) {
  try {
    const dataString = JSON.stringify(data)
    const combinedData = `${dataString}:${sessionKey}`
    const encodedData = new TextEncoder().encode(combinedData)
    
    const hashBuffer = await crypto.subtle.digest('SHA-256', encodedData)
    return arrayBufferToBase64(hashBuffer)
  } catch (error) {
    console.error('Integrity calculation error:', error)
    throw new Error('Integrity calculation failed')
  }
}

/**
 * Verify data integrity
 */
async function verifyIntegrity(data, expectedHash, sessionKey) {
  try {
    const calculatedHash = await calculateIntegrity(data, sessionKey)
    return calculatedHash === expectedHash
  } catch (error) {
    console.error('Integrity verification error:', error)
    return false
  }
}

/**
 * Handle user profile requests
 */
async function handleUserProfile(method, data, userId) {
  switch (method) {
    case 'GET':
      // Return user profile (would fetch from KV store)
      return {
        userId: userId,
        profile: {
          name: 'User Name',
          email: 'user@example.com',
          preferences: {},
          created: Date.now()
        }
      }
    case 'PUT':
      // Update user profile (would save to KV store)
      return { success: true, message: 'Profile updated' }
    default:
      throw new Error('Method not allowed')
  }
}

/**
 * Handle reading progress requests
 */
async function handleReadingProgress(method, data, userId) {
  switch (method) {
    case 'GET':
      // Return reading progress (would fetch from KV store)
      return {
        userId: userId,
        progress: [
          { novelId: 'novel-1', chapterId: 'chapter-5', position: 0.75, timestamp: Date.now() }
        ]
      }
    case 'POST':
    case 'PUT':
      // Save reading progress (would save to KV store)
      return { success: true, message: 'Progress saved' }
    default:
      throw new Error('Method not allowed')
  }
}

/**
 * Handle user preferences requests
 */
async function handleUserPreferences(method, data, userId) {
  switch (method) {
    case 'GET':
      // Return user preferences (would fetch from KV store)
      return {
        userId: userId,
        preferences: {
          theme: 'dark',
          fontSize: 16,
          fontFamily: 'serif',
          readingMode: 'scroll'
        }
      }
    case 'PUT':
      // Update preferences (would save to KV store)
      return { success: true, message: 'Preferences updated' }
    default:
      throw new Error('Method not allowed')
  }
}

/**
 * Handle bookmarks requests
 */
async function handleBookmarks(method, data, userId) {
  switch (method) {
    case 'GET':
      // Return bookmarks (would fetch from KV store)
      return {
        userId: userId,
        bookmarks: [
          { id: 'bookmark-1', novelId: 'novel-1', chapterId: 'chapter-3', note: 'Interesting plot twist' }
        ]
      }
    case 'POST':
      // Add bookmark (would save to KV store)
      return { success: true, message: 'Bookmark added' }
    case 'DELETE':
      // Delete bookmark (would remove from KV store)
      return { success: true, message: 'Bookmark deleted' }
    default:
      throw new Error('Method not allowed')
  }
}

/**
 * Handle login request
 */
async function handleLogin(data) {
  try {
    // Validate credentials (in production, would check against secure storage)
    if (!data.username || !data.password) {
      return createErrorResponse('Missing credentials', 400)
    }

    // Generate session token and key
    const sessionToken = await generateSessionToken()
    const sessionKey = await generateSessionKey()

    // Store session (in production, would save to KV store)
    // await SESSIONS.put(sessionToken, JSON.stringify({
    //   userId: 'user-123',
    //   sessionKey: sessionKey,
    //   created: Date.now(),
    //   expires: Date.now() + (24 * 60 * 60 * 1000)
    // }))

    return createSuccessResponse({
      sessionToken: sessionToken,
      sessionKey: sessionKey,
      userId: 'user-123',
      expires: Date.now() + (24 * 60 * 60 * 1000)
    })
  } catch (error) {
    console.error('Login error:', error)
    return createErrorResponse('Login failed', 500)
  }
}

/**
 * Generate session token
 */
async function generateSessionToken() {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return arrayBufferToBase64(array.buffer)
}

/**
 * Parse request body
 */
async function parseRequestBody(request) {
  try {
    const contentType = request.headers.get('Content-Type')
    if (contentType && contentType.includes('application/json')) {
      return await request.json()
    }
    return null
  } catch (error) {
    console.error('Body parsing error:', error)
    return null
  }
}

/**
 * Create success response
 */
function createSuccessResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status: status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
      ...SECURITY_HEADERS
    }
  })
}

/**
 * Create error response
 */
function createErrorResponse(message, status = 500) {
  return new Response(JSON.stringify({ error: message }), {
    status: status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
      ...SECURITY_HEADERS
    }
  })
}

/**
 * Convert ArrayBuffer to Base64
 */
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * Convert Base64 to ArrayBuffer
 */
function base64ToArrayBuffer(base64) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}