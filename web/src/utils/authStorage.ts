import {
  getLocalStorageItem,
  removeLocalStorageKey,
  setLocalStorageItem,
} from '@/utils/browserStorage'

export const AUTH_TOKEN_STORAGE_KEY = 'nexus_auth_token'

export function getAuthToken(): string | null {
  return getLocalStorageItem(AUTH_TOKEN_STORAGE_KEY)
}

export function setAuthToken(token: string): void {
  setLocalStorageItem(AUTH_TOKEN_STORAGE_KEY, token)
}

export function clearAuthToken(): void {
  removeLocalStorageKey(AUTH_TOKEN_STORAGE_KEY)
}
