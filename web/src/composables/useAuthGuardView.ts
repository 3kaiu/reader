import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/stores/auth'

export function useAuthGuardView() {
  const authStore = useAuthStore()
  const { isChecking, isAuthenticated, user, error } = storeToRefs(authStore)

  onMounted(() => {
    void authStore.hydrateAuth()
  })

  return {
    isChecking,
    isAuthenticated,
    user,
    error,
    loginWithGitHub: authStore.loginWithGitHub,
  }
}
