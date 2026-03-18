/**
 * User Store
 *
 * Manages user authentication and preferences
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { errorHandler } from '@/utils/unified-utils'
import { $post, $put } from '@/api/client'
import type { User, UserPreferences, LoginCredentials } from './types'

export const useUserStore = defineStore('user', () => {
  const user = ref<User | null>(null)
  const preferences = ref<UserPreferences | null>(null)
  const showLoginModal = ref(false)
  const isAuthenticated = computed(() => !!user.value)
  const isLoading = ref(false)

  const setToken = (token: string) => {
    localStorage.setItem('nexus_auth_token', token)
  }

  const setUserInfo = (info: Partial<User>) => {
    const previous = user.value
    user.value = {
      id: previous?.id || info.id || crypto.randomUUID(),
      username: info.username || previous?.username || '',
      email: info.email || previous?.email || '',
      displayName: info.displayName ?? previous?.displayName,
      avatar: info.avatar ?? previous?.avatar,
      role: info.role || previous?.role || 'reader',
      createdAt: previous?.createdAt || info.createdAt || new Date(),
      lastLoginAt: info.lastLoginAt ?? previous?.lastLoginAt,
    }
  }

  const openLoginModal = () => {
    showLoginModal.value = true
  }

  const closeLoginModal = () => {
    showLoginModal.value = false
  }

  const login = async (credentials: LoginCredentials) => {
    isLoading.value = true
    try {
      const response = await $post<{
        user: User
        preferences: UserPreferences
        token: string
      }>('/auth/login', credentials)

      if (response.isSuccess && response.data) {
        user.value = response.data.user
        preferences.value = response.data.preferences

        // Store token for future requests
        if (response.data.token) {
          localStorage.setItem('nexus_auth_token', response.data.token)
        }
      }
    } catch (error: unknown) {
      errorHandler.handle(error instanceof Error ? error : String(error), {
        component: 'user-store',
        operation: 'login',
      })
    } finally {
      isLoading.value = false
    }
  }

  const logout = async () => {
    try {
      await $post('/auth/logout')
      user.value = null
      preferences.value = null
      localStorage.removeItem('nexus_auth_token')
    } catch (error: unknown) {
      errorHandler.handle(error instanceof Error ? error : String(error), {
        component: 'user-store',
        operation: 'logout',
      })
    }
  }

  const updatePreferences = async (newPreferences: Partial<UserPreferences>) => {
    try {
      if (preferences.value) {
        const response = await $put<UserPreferences>('/user/preferences', preferences.value)
        if (response.isSuccess && response.data) {
          Object.assign(preferences.value, newPreferences)
        }
      }
    } catch (error: unknown) {
      errorHandler.handle(error instanceof Error ? error : String(error), {
        component: 'user-store',
        operation: 'update-preferences',
      })
    }
  }

  return {
    user,
    preferences,
    showLoginModal,
    isAuthenticated,
    isLoading,
    setToken,
    setUserInfo,
    openLoginModal,
    closeLoginModal,
    login,
    logout,
    updatePreferences,
  }
})
