/**
 * Shared Authentication Module for Cloudflare Workers
 * 
 * Provides unified authentication logic for all workers:
 * - Token verification with HMAC-SHA256
 * - Constant-time signature comparison (prevents timing attacks)
 * - Support for both Authorization header and Cookie authentication
 */

// ============================================
// Type Definitions
// ============================================

/**
 * Environment variables required for authentication
 */
export interface AuthEnv {
  AUTH_SECRET: string;
}

/**
 * Token payload structure
 */
export interface TokenPayload {
  id: string;      // User ID
  exp: number;     // Expiration timestamp (milliseconds)
  [key: string]: unknown;  // Additional optional fields
}

/**
 * Authentication result type
 */
export type AuthResult = TokenPayload | null;

// ============================================
// Constant-Time Comparison
// ============================================

/**
 * Constant-time string comparison to prevent timing attacks
 * 
 * @param a - First string
 * @param b - Second string
 * @returns true if strings are equal, false otherwise
 * 
 * Time complexity: O(n) where n is the length of the strings
 * The comparison time does not vary based on where the strings differ
 */
export function constantTimeEqual(a: string, b: string): boolean {
  // Different lengths = not equal (early return is safe here)
  if (a.length !== b.length) {
    return false;
  }
  
  // Accumulate XOR results using bitwise OR
  // This ensures constant time regardless of where strings differ
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  
  // result === 0 only if all characters matched
  return result === 0;
}

// ============================================
// Token Verification
// ============================================

/**
 * Verify authentication token from request
 * 
 * Supports two authentication methods:
 * 1. Authorization header: "Bearer <token>"
 * 2. Cookie: "nexus_auth=<token>"
 * 
 * Token format: <base64_data>.<base64_signature>
 * - data: Base64-encoded JSON payload
 * - signature: HMAC-SHA256 signature of data
 * 
 * @param request - HTTP request object
 * @param env - Environment variables (must contain AUTH_SECRET)
 * @returns Token payload if valid, null otherwise
 * 
 * Returns null in these cases:
 * - Token not found in request
 * - Token format is invalid
 * - Signature verification fails
 * - Token is expired
 * - Any decoding/parsing error occurs
 */
export async function verifyAuth(
  request: Request,
  env: AuthEnv
): Promise<AuthResult> {
  try {
    // Extract token from Authorization header (priority)
    const authHeader = request.headers.get('Authorization') || '';
    let token = authHeader.replace('Bearer ', '');
    
    // Fallback: Extract token from Cookie
    if (!token) {
      const cookie = request.headers.get('Cookie') || '';
      const tokenMatch = cookie.match(/nexus_auth=([^;]+)/);
      token = tokenMatch ? tokenMatch[1] : '';
    }
    
    // No token found
    if (!token) {
      return null;
    }
    
    // Split token into data and signature
    const [data, sig] = token.split('.');
    if (!data || !sig) {
      return null;
    }
    
    // Import HMAC key
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(env.AUTH_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify']
    );
    
    // Compute expected signature
    const expectedSig = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(data)
    );
    const expectedSigB64 = btoa(
      String.fromCharCode(...new Uint8Array(expectedSig))
    );
    
    // Constant-time signature comparison (prevents timing attacks)
    if (!constantTimeEqual(sig, expectedSigB64)) {
      return null;
    }
    
    // Decode and parse payload
    const payload = JSON.parse(atob(data)) as TokenPayload;
    
    // Check expiration
    if (payload.exp < Date.now()) {
      return null;
    }
    
    return payload;
  } catch (error) {
    // Any error during verification = invalid token
    // Don't throw, just return null
    return null;
  }
}
