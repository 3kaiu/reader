/**
 * Crypto API Polyfill for Node.js Testing Environment
 * Provides Web Crypto API compatibility in Node.js test environment
 */

import { webcrypto } from 'crypto'
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'util'

type CryptoSubtleMethod =
  | 'encrypt'
  | 'decrypt'
  | 'sign'
  | 'verify'
  | 'digest'
  | 'generateKey'
  | 'deriveKey'
  | 'deriveBits'
  | 'importKey'
  | 'exportKey'
  | 'wrapKey'
  | 'unwrapKey'

type BoundSubtleCrypto = {
  [K in CryptoSubtleMethod]: typeof webcrypto.subtle[K]
}

interface CryptoPolyfillShape {
  getRandomValues: typeof webcrypto.getRandomValues
  randomUUID: () => string
  subtle: BoundSubtleCrypto
}

interface TestNavigator {
  userAgent: string
  language: string
  languages: string[]
  platform: string
  cookieEnabled: boolean
  onLine: boolean
  connection: {
    effectiveType: string
    downlink: number
    rtt: number
    saveData: boolean
  }
  serviceWorker: {
    register: () => Promise<never>
  }
}

interface TestWindowLocation {
  href: string
  origin: string
  pathname: string
  search: string
  hash: string
}

interface TestWindow {
  location: TestWindowLocation
  localStorage: Storage
  sessionStorage: Storage
  addEventListener: (_event: string, _handler: EventListenerOrEventListenerObject) => void
  removeEventListener: (_event: string, _handler: EventListenerOrEventListenerObject) => void
  dispatchEvent: (_event: Event) => boolean
}

interface TestDocument {
  createElement: (_tagName?: string) => Record<string, never>
  head: {
    appendChild: (_node: unknown) => void
  }
  body: {
    appendChild: (_node: unknown) => void
  }
}

const subtleMethods: CryptoSubtleMethod[] = [
  'encrypt',
  'decrypt',
  'sign',
  'verify',
  'digest',
  'generateKey',
  'deriveKey',
  'deriveBits',
  'importKey',
  'exportKey',
  'wrapKey',
  'unwrapKey'
]

const defineGlobalValue = (property: string, value: unknown): void => {
  Object.defineProperty(globalThis, property, {
    value,
    writable: true,
    configurable: true
  })
}

const createStorageMock = (): Storage => {
  const values = new Map<string, string>()

  return {
    get length() {
      return values.size
    },
    clear: () => {
      values.clear()
    },
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => {
      values.delete(key)
    },
    setItem: (key: string, value: string) => {
      values.set(key, value)
    }
  }
}

// Create a comprehensive crypto polyfill
const cryptoPolyfill: CryptoPolyfillShape = {
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
    defineGlobalValue('crypto', cryptoPolyfill)
  }
} catch (error: unknown) {
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
    subtleMethods.forEach(method => {
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
if (!globalThis.btoa) {
  defineGlobalValue('btoa', (str: string) => {
    try {
      return Buffer.from(str, 'binary').toString('base64')
    } catch (error: unknown) {
      // Fallback for invalid characters
      // `\x00` control character range triggers `no-control-regex` in this lint setup.
      // We only use it for test polyfill sanitization.
      // eslint-disable-next-line no-control-regex
      const cleanStr = str.replace(/[^\x00-\xFF]/g, '?')
      return Buffer.from(cleanStr, 'binary').toString('base64')
    }
  })
}

if (!globalThis.atob) {
  defineGlobalValue('atob', (str: string) => {
    try {
      return Buffer.from(str, 'base64').toString('binary')
    } catch (error: unknown) {
      // Fallback for invalid base64
      console.warn('Invalid base64 string:', str)
      return ''
    }
  })
}

// TextEncoder/TextDecoder polyfills (usually available in Node.js 11+)
if (!globalThis.TextEncoder) {
  defineGlobalValue('TextEncoder', NodeTextEncoder)
  defineGlobalValue('TextDecoder', NodeTextDecoder)
}

// Mock navigator for tests
if (typeof globalThis.navigator === 'undefined') {
  const navigatorMock: TestNavigator = {
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
  }

  defineGlobalValue('navigator', navigatorMock)
}

// Mock window for tests
if (typeof globalThis.window === 'undefined') {
  const windowMock: TestWindow = {
    location: {
      href: 'http://localhost:3000/test',
      origin: 'http://localhost:3000',
      pathname: '/test',
      search: '',
      hash: ''
    },
    localStorage: createStorageMock(),
    sessionStorage: createStorageMock(),
    addEventListener: (_event: string, _handler: EventListenerOrEventListenerObject) => {
      // Mock event listener - do nothing in test environment
    },
    removeEventListener: (_event: string, _handler: EventListenerOrEventListenerObject) => {
      // Mock event listener removal - do nothing in test environment
    },
    dispatchEvent: (_event: Event) => {
      // Mock event dispatch - do nothing in test environment
      return true
    }
  }

  defineGlobalValue('window', windowMock)
}

// Mock document for tests
if (typeof globalThis.document === 'undefined') {
  const documentMock: TestDocument = {
    createElement: () => ({}),
    head: { appendChild: () => {} },
    body: { appendChild: () => {} }
  }

  defineGlobalValue('document', documentMock)
}

console.log('✅ Crypto polyfill loaded successfully')
console.log('✅ crypto available:', !!globalThis.crypto)
console.log('✅ crypto.subtle available:', !!globalThis.crypto?.subtle)
console.log('✅ crypto.subtle.deriveKey available:', !!globalThis.crypto?.subtle?.deriveKey)
console.log('✅ crypto.subtle.deriveKey type:', typeof globalThis.crypto?.subtle?.deriveKey)

export {}
