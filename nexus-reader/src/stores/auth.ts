import { ref } from 'vue'
import { defineStore } from 'pinia'
import { clearAuthToken, getAuthToken, setAuthToken } from '@/utils/authStorage'
import { logger } from '@/utils/logger'

type AuthUser = {
  provider: string
  id: string
  name: string
  avatar?: string
}

export const useAuthStore = defineStore('auth', () => {
  const authWorkerUrl = import.meta.env.VITE_AUTH_WORKER_URL || ''

  const isChecking = ref(true)
  const isAuthenticated = ref(false)
  const user = ref<AuthUser | null>(null)
  const error = ref<string | null>(null)

  function resetAuthState() {
    isChecking.value = true
    isAuthenticated.value = false
    user.value = null
  }

  function checkUrlError() {
    const params = new URLSearchParams(window.location.search)

    const token = params.get('token')
    if (token) {
      setAuthToken(token)
      window.history.replaceState({}, '', window.location.pathname + window.location.hash)
    }

    const urlError = params.get('error')
    if (urlError) {
      error.value =
        urlError === 'unauthorized' ? '你的账号未被授权访问' : `登录失败: ${urlError}`
      window.history.replaceState({}, '', window.location.pathname + window.location.hash)
    }
  }

  async function checkAuth() {
    if (!authWorkerUrl) {
      isAuthenticated.value = true
      isChecking.value = false
      return
    }

    const token = getAuthToken()
    if (!token) {
      isAuthenticated.value = false
      isChecking.value = false
      return
    }

    try {
      const response = await fetch(`${authWorkerUrl}/verify`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json()

      isAuthenticated.value = data.authenticated
      if (data.authenticated && data.user) {
        user.value = data.user
      } else {
        clearAuthToken()
      }
    } catch (error) {
      logger.error('Auth check failed', { error })
      isAuthenticated.value = true
    } finally {
      isChecking.value = false
    }
  }

  async function hydrateAuth() {
    resetAuthState()
    checkUrlError()
    await checkAuth()
  }

  function loginWithGitHub() {
    if (authWorkerUrl) {
      window.location.href = `${authWorkerUrl}/login/github`
    }
  }

  return {
    authWorkerUrl,
    isChecking,
    isAuthenticated,
    user,
    error,
    checkUrlError,
    checkAuth,
    hydrateAuth,
    loginWithGitHub,
  }
})
