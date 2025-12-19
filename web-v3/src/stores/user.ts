import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useUserStore = defineStore('user', () => {
  // 状态
  const token = ref(localStorage.getItem('api_token') || '')
  const userInfo = ref<{
    username?: string
    enableLocalStore?: boolean
  } | null>(null)
  const showLoginModal = ref(false)
  const isSecureMode = ref(false)
  const isManagerMode = ref(false)

  // 计算属性
  const isLoggedIn = computed(() => !!token.value)
  const username = computed(() => userInfo.value?.username || 'default')

  // 方法
  function setToken(newToken: string) {
    token.value = newToken
    localStorage.setItem('api_token', newToken)
  }

  function logout() {
    token.value = ''
    userInfo.value = null
    localStorage.removeItem('api_token')
  }

  function setUserInfo(info: typeof userInfo.value) {
    userInfo.value = info
  }

  return {
    token,
    userInfo,
    showLoginModal,
    isSecureMode,
    isManagerMode,
    isLoggedIn,
    username,
    setToken,
    logout,
    setUserInfo,
  }
})
