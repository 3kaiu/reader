/**
 * Test setup for authentication tests
 * Sets up global mocks before any modules are imported
 */

import { vi } from 'vitest'

// Mock localStorage
const mockLocalStorage = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value }),
    removeItem: vi.fn((key: string) => { delete store[key] }),
    clear: vi.fn(() => { store = {} }),
    key: vi.fn((index: number) => Object.keys(store)[index] || null),
    get length() { return Object.keys(store).length }
  }
})()

// Mock crypto.subtle
const mockCrypto = {
  subtle: {
    generateKey: vi.fn().mockResolvedValue({}),
    exportKey: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
    importKey: vi.fn().mockResolvedValue({}),
    encrypt: vi.fn().mockResolvedValue(new ArrayBuffer(48)),
    decrypt: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
    deriveBits: vi.fn().mockResolvedValue(new ArrayBuffer(32))
  },
  getRandomValues: vi.fn((arr: Uint8Array) => {
    for (let i = 0; i < arr.length; i++) {
      arr[i] = Math.floor(Math.random() * 256)
    }
    return arr
  })
}

// Setup global mocks
vi.stubGlobal('localStorage', mockLocalStorage)
vi.stubGlobal('crypto', mockCrypto)

export { mockLocalStorage, mockCrypto }