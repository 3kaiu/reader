/**
 * Secure Random Utilities
 * Uses crypto.getRandomValues() for cryptographically secure randomness
 */

/**
 * Generate a cryptographically secure random string
 */
export function secureRandomString(length: number = 16): string {
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('').slice(0, length)
}

/**
 * Generate a secure random ID with prefix
 */
export function secureRandomId(prefix: string = 'id'): string {
  return `${prefix}_${Date.now()}_${secureRandomString(8)}`
}

/**
 * Generate secure random bytes
 */
export function secureRandomBytes(length: number): Uint8Array {
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  return array
}

/**
 * Generate a secure random integer in range [0, max)
 */
export function secureRandomInt(max: number): number {
  const array = new Uint32Array(1)
  crypto.getRandomValues(array)
  return array[0] % max
}
