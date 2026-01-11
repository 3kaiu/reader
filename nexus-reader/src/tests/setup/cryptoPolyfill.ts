/**
 * Crypto API Polyfill for Node.js Testing Environment
 * Provides Web Crypto API compatibility in Node.js test environment
 */

import { webcrypto } from 'crypto'

// Create a comprehensive crypto polyfill
const cryptoPolyfill = {
  getRandomValues: webcrypto.getRandomValues.bind(webcrypto),
  randomUUID: webcrypto.randomUUID?.bind(webcrypto) || (() => {
    // Fallback UUID generation for older Node.js versions
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }),
  subtle: {
    encrypt: webcrypto.subtle.encrypt.bind(webcrypto.subtle),
    decrypt: webcrypto.subtle.decrypt.bind(webcrypto.subtle),
    sign: webcrypto.subtle.sign.bind(webcrypto.subtle),
    verify: webcrypto.subtle.verify.bind(webcrypto.subtle),
    digest: webcrypto.subtle.digest.bind(webcrypto.subtle),
    generateKey: webcrypto.subtle.generateKey.bind(webcrypto.subtle),
    deriveKey: webcrypto.subtle.deriveKey.bind(webcrypto.subtle),
    deriveBits: webcrypto.subtle.deriveBits.bind(webcrypto.subtle),
    importKey: webcrypto.subtle.importKey.bind(webcrypto.subtle),
    exportKey: webcrypto.subtle.exportKey.bind(webcrypto.subtle),
    wrapKey: webcrypto.subtle.wrapKey.bind(webcrypto.subtle),
    unwrapKey: webcrypto.subtle.unwrapKey.bind(webcrypto.subtle)
  }
}

// Force polyfill Web Crypto API for Node.js testing environment
try {
  // Try to set crypto if it's not already set or is incomplete
  if (!globalThis.crypto || !globalThis.crypto.subtle || !globalThis.crypto.subtle.deriveKey) {
    // Use Object.defineProperty to override the read-only property
    Object.defineProperty(globalThis, 'crypto', {
      value: cryptoPolyfill,
      writable: true,
      configurable: true
    })
  }
} catch (error) {
  // If we can't override crypto, try to patch the specific methods we need
  if (globalThis.crypto && !globalThis.crypto.subtle) {
    Object.defineProperty(globalThis.crypto, 'subtle', {
      value: cryptoPolyfill.subtle,
      writable: true,
      configurable: true
    })
  }
  
  if (globalThis.crypto?.subtle) {
    // Patch individual methods
    Object.keys(cryptoPolyfill.subtle).forEach(method => {
      if (!globalThis.crypto.subtle[method]) {
        Object.defineProperty(globalThis.crypto.subtle, method, {
          value: cryptoPolyfill.subtle[method],
          writable: true,
          configurable: true
        })
      }
    })
  }
}

// Additional polyfills for browser APIs used in tests
globalThis.btoa = globalThis.btoa || ((str: string) => {
  try {
    return Buffer.from(str, 'binary').toString('base64')
  } catch (error) {
    // Fallback for invalid characters
    const cleanStr = str.replace(/[^\x00-\xFF]/g, '?')
    return Buffer.from(cleanStr, 'binary').toString('base64')
  }
})

globalThis.atob = globalThis.atob || ((str: string) => {
  try {
    return Buffer.from(str, 'base64').toString('binary')
  } catch (error) {
    // Fallback for invalid base64
    console.warn('Invalid base64 string:', str)
    return ''
  }
})

// TextEncoder/TextDecoder polyfills (usually available in Node.js 11+)
if (!globalThis.TextEncoder) {
  const { TextEncoder, TextDecoder } = require('util')
  globalThis.TextEncoder = TextEncoder
  globalThis.TextDecoder = TextDecoder
}

// Mock navigator for tests
if (typeof globalThis.navigator === 'undefined') {
  globalThis.navigator = {
    userAgent: 'test-user-agent',
    language: 'en-US',
    languages: ['en-US'],
    platform: 'test',
    cookieEnabled: true,
    onLine: true,
    connection: {
      effectiveType: '4g',
      downlink: 10,
      rtt: 50,
      saveData: false
    },
    serviceWorker: {
      register: () => Promise.reject(new Error('Service Worker not available in test environment'))
    }
  } as any
}

// Mock window for tests
if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    location: {
      href: 'http://localhost:3000/test',
      origin: 'http://localhost:3000',
      pathname: '/test',
      search: '',
      hash: ''
    },
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      length: 0,
      key: () => null
    },
    sessionStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      length: 0,
      key: () => null
    },
    addEventListener: (event: string, handler: Function) => {
      // Mock event listener - do nothing in test environment
    },
    removeEventListener: (event: string, handler: Function) => {
      // Mock event listener removal - do nothing in test environment
    },
    dispatchEvent: (event: Event) => {
      // Mock event dispatch - do nothing in test environment
      return true
    }
  } as any
}

// Mock document for tests
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElement: () => ({}),
    head: { appendChild: () => {} },
    body: { appendChild: () => {} }
  } as any
}

console.log('✅ Crypto polyfill loaded successfully')
console.log('✅ crypto available:', !!globalThis.crypto)
console.log('✅ crypto.subtle available:', !!globalThis.crypto?.subtle)
console.log('✅ crypto.subtle.deriveKey available:', !!globalThis.crypto?.subtle?.deriveKey)
console.log('✅ crypto.subtle.deriveKey type:', typeof globalThis.crypto?.subtle?.deriveKey)

export {}